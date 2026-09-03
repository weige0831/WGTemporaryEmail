#!/bin/sh
# Entrypoint: generate a self-signed placeholder certificate when none exists
# yet (so nginx can start with the 443 listener), then run nginx and watch
# the certificate for changes (certbot renewals) to hot-reload.
set -e

CERT=/config/certs/cert.pem
KEY=/config/certs/key.pem

mkdir -p /config/certs
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
  echo "No certificate found - generating self-signed placeholder for $CERT"
  openssl req -x509 -newkey rsa:2048 -nodes \
    -keyout "$KEY" -out "$CERT" -days 3650 \
    -subj "/CN=localhost" >/dev/null 2>&1
  chmod 644 "$CERT" "$KEY"
fi

nginx

# Watch the certificate files and reload nginx when they change.
last_cert=$(stat -c %Y "$CERT" 2>/dev/null || echo 0)
last_key=$(stat -c %Y "$KEY" 2>/dev/null || echo 0)
while true; do
  sleep 30
  now_cert=$(stat -c %Y "$CERT" 2>/dev/null || echo "$last_cert")
  now_key=$(stat -c %Y "$KEY" 2>/dev/null || echo "$last_key")
  if [ "$now_cert" != "$last_cert" ] || [ "$now_key" != "$last_key" ]; then
    echo "Certificate changed - reloading nginx"
    nginx -s reload
    last_cert=$now_cert
    last_key=$now_key
  fi
done
