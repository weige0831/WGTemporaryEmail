#!/bin/sh
# Entrypoint: generate the nginx config from config.yaml (web hostname and
# IP-access policy), generate a self-signed placeholder certificate when no
# certificate exists yet, run nginx, and hot-reload on certificate or config
# changes.
set -e

CERT=/config/certs/cert.pem
KEY=/config/certs/key.pem
CONFIG=/config/config.yaml

mkdir -p /config/certs
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "No certificate found - generating self-signed placeholder for $CERT"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$KEY" -out "$CERT" -days 3650 \
    -subj "/CN=localhost" >/dev/null 2>&1
  chmod 644 "$CERT" "$KEY"
fi

LAST_WEB_HOSTNAME=""
LAST_ALLOW_IP="true"

read_web_config() {
  WEB_HOSTNAME=""
  ALLOW_IP="true"
  if [ -f "$CONFIG" ]; then
    WEB_HOSTNAME=$(sed -n '/^web:/,/^[a-zA-Z]/p' "$CONFIG" | grep -E '^[[:space:]]+hostname:' | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'")
    ALLOW_IP=$(sed -n '/^web:/,/^[a-zA-Z]/p' "$CONFIG" | grep -E '^[[:space:]]+allow_ip_access:' | head -1 | awk '{print $2}' | tr -d '"' | tr -d "'")
  fi
  # 防护：配置写入瞬间可能读到残缺值，非法则沿用上次有效值
  case "$WEB_HOSTNAME" in
    *[!a-zA-Z0-9.-]*) WEB_HOSTNAME="$LAST_WEB_HOSTNAME" ;;
  esac
  if [ "$ALLOW_IP" != "true" ] && [ "$ALLOW_IP" != "false" ]; then
    ALLOW_IP="$LAST_ALLOW_IP"
  fi
  LAST_WEB_HOSTNAME="$WEB_HOSTNAME"
  LAST_ALLOW_IP="$ALLOW_IP"
}

generate_conf() {
  read_web_config
  SERVER_NAME="$WEB_HOSTNAME"
  [ -z "$SERVER_NAME" ] && SERVER_NAME="_"

  # 主服务：正式域名
  cat > /etc/nginx/conf.d/default.conf <<'MAIN_EOF'
server {
    listen 80;
    server_name @SERVER_NAME@;
    root /usr/share/nginx/html;
    index index.html;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    include /etc/nginx/locations.conf;
    error_page 404 /404.html;
}
server {
    listen 443 ssl;
    server_name @SERVER_NAME@;
    root /usr/share/nginx/html;
    index index.html;
    ssl_certificate /config/certs/cert.pem;
    ssl_certificate_key /config/certs/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
    include /etc/nginx/locations.conf;
    error_page 404 /404.html;
}
MAIN_EOF

  # 兜底服务：IP / 其他域名
  cat >> /etc/nginx/conf.d/default.conf <<'CATCH_EOF'
server {
    listen 80 default_server;
    listen 443 ssl default_server;
    server_name _;
    root /usr/share/nginx/html;
    index index.html;
    ssl_certificate /config/certs/cert.pem;
    ssl_certificate_key /config/certs/key.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    gzip on;
    gzip_types text/plain text/css application/javascript application/json image/svg+xml;
CATCH_EOF

  if [ -n "$WEB_HOSTNAME" ] && [ "$ALLOW_IP" != "true" ]; then
    # 限制模式：仅后台 / API / 证书验证路径可用，其余重定向到正式域名
    cat >> /etc/nginx/conf.d/default.conf <<'LIMIT_EOF'
    location ^~ /.well-known/acme-challenge/ {
        root /var/www/certbot;
        default_type text/plain;
    }
    location /api/ {
        proxy_pass http://api:8000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /api { try_files /api.html =404; }
    location = /api/ { return 301 /api; }
    location /docs {
        proxy_pass http://api:8000/docs;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location /redoc {
        proxy_pass http://api:8000/redoc;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location = /openapi.json {
        proxy_pass http://api:8000/openapi.json;
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-For $remote_addr;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
    location ^~ /admin { try_files $uri $uri.html $uri/index.html =404; }
    location = /setup { try_files /setup.html =404; }
    location /_next/ { try_files $uri =404; }
    location / { return 302 https://@WEB_HOSTNAME@$request_uri; }
LIMIT_EOF
  else
    cat >> /etc/nginx/conf.d/default.conf <<'FULL_EOF'
    include /etc/nginx/locations.conf;
    error_page 404 /404.html;
FULL_EOF
  fi
  echo "}" >> /etc/nginx/conf.d/default.conf

  sed -i "s|@SERVER_NAME@|$SERVER_NAME|g; s|@WEB_HOSTNAME@|$WEB_HOSTNAME|g" /etc/nginx/conf.d/default.conf
}

generate_conf
nginx

# 监控证书与配置变化并热重载
last_cert=$(stat -c %Y "$CERT" 2>/dev/null || echo 0)
last_key=$(stat -c %Y "$KEY" 2>/dev/null || echo 0)
last_conf=$(stat -c %Y "$CONFIG" 2>/dev/null || echo 0)
while true; do
  sleep 20
  now_cert=$(stat -c %Y "$CERT" 2>/dev/null || echo "$last_cert")
  now_key=$(stat -c %Y "$KEY" 2>/dev/null || echo "$last_key")
  now_conf=$(stat -c %Y "$CONFIG" 2>/dev/null || echo "$last_conf")

  if [ "$now_cert" != "$last_cert" ] || [ "$now_key" != "$last_key" ]; then
    echo "Certificate changed - reloading nginx"
    nginx -s reload
    last_cert=$now_cert
    last_key=$now_key
  fi

  if [ "$now_conf" != "$last_conf" ]; then
    echo "config.yaml changed - regenerating nginx config"
    if generate_conf && nginx -t >/dev/null 2>&1; then
      nginx -s reload
      last_conf=$now_conf
      echo "nginx config regenerated and reloaded"
    else
      echo "nginx config generation failed - keeping previous config"
    fi
  fi
done
