#!/bin/sh
# Certbot sidecar main loop.
#
# Directories (mounted):
#   /certbot-data               - state: letsencrypt config/work/logs + jobs
#   /certbot-data/webroot       - HTTP-01 challenge files (shared with nginx)
#   /certbot-data/certs         - output cert.pem/key.pem (shared with MX)
#
# The admin API writes /certbot-data/jobs/issue.json and reads
# /certbot-data/jobs/result.json. This loop also runs a daily renew check.

set -e

CFG_DIR=/certbot-data/letsencrypt
WORK_DIR=/certbot-data/letsencrypt-work
LOG_DIR=/certbot-data/letsencrypt-logs
WEBROOT=/certbot-data/webroot
CERTS_OUT=/certbot-data/certs
JOBS_DIR=/certbot-data/jobs

mkdir -p "$CFG_DIR" "$WORK_DIR" "$LOG_DIR" "$WEBROOT" "$CERTS_OUT" "$JOBS_DIR"
# The API container (uid 1000) submits jobs into $JOBS_DIR. Ownership goes to
# that uid with group root and mode 770: writable by the API and by this
# root-run sidecar, but not world-writable (a world-writable job queue would
# let any process in either container forge issuance requests or results).
chown 1000:0 "$JOBS_DIR" 2>/dev/null || true
chmod 770 "$JOBS_DIR"

process_issue_job() {
  job="$1"

  # Build the domain arguments one at a time and pass them as "$@": the values
  # come from config.yaml via the admin API, and expanding them unquoted would
  # let an option-looking hostname inject extra certbot flags (a rogue
  # --server/--deploy-hook would run as root in this container). The pattern
  # check below rejects anything that is not a plain DNS name.
  set --
  domains_ok=1
  while IFS= read -r d; do
    [ -z "$d" ] && continue
    case "$d" in
      *[!a-zA-Z0-9.-]*|.*|-*|*..*)
        echo "Refusing job: invalid domain '$d'"
        domains_ok=0
        break
        ;;
    esac
    set -- "$@" -d "$d"
  done <<DOMAINS_EOF
$(python3 -c "import json;[print(d) for d in json.load(open('$job')).get('domains',[])]" 2>/dev/null || true)
DOMAINS_EOF

  email=$(python3 -c "import json;print(json.load(open('$job')).get('email',''))" 2>/dev/null || true)
  case "$email" in
    ""|*[!a-zA-Z0-9@._+-]*) domains_ok=0 ;;
  esac

  if [ "$domains_ok" != "1" ] || [ "$#" -eq 0 ]; then
    python3 -c "import json;json.dump({'ok':False,'message':'invalid job: email or domains missing/invalid'},open('$JOBS_DIR/result.json','w'))"
    rm -f "$job"
    return
  fi

  echo "Issuing certificate for: $*"
  if certbot certonly --non-interactive --agree-tos --no-eff-email \
      --cert-name default \
      --email "$email" --webroot -w "$WEBROOT" \
      --config-dir "$CFG_DIR" --work-dir "$WORK_DIR" --logs-dir "$LOG_DIR" \
      "$@" > /tmp/certbot-issue.log 2>&1; then
    cp -L "$CFG_DIR/live/default/fullchain.pem" "$CERTS_OUT/cert.pem"
    cp -L "$CFG_DIR/live/default/privkey.pem" "$CERTS_OUT/key.pem"
    # Owned by uid 1000 (the non-root user inside the mx/api containers) so the
    # private key can be 640 instead of world-readable.
    chown 1000:0 "$CERTS_OUT/cert.pem" "$CERTS_OUT/key.pem" 2>/dev/null || true
    chmod 644 "$CERTS_OUT/cert.pem"
    chmod 640 "$CERTS_OUT/key.pem"
    python3 -c "import json;json.dump({'ok':True,'message':'certificate issued','issuedAt':'$(date -u +%Y-%m-%dT%H:%M:%SZ)'},open('$JOBS_DIR/result.json','w'))"
    echo "Certificate issued and copied to $CERTS_OUT"
  else
    msg=$(tail -8 /tmp/certbot-issue.log | tr '\n' ' ' | cut -c1-400)
    python3 -c "import json,sys;json.dump({'ok':False,'message':sys.argv[1]},open('$JOBS_DIR/result.json','w'))" "$msg"
    echo "Issuance failed: $msg"
  fi
  rm -f "$job"
}

renew_check() {
  if [ ! -d "$CFG_DIR/live/default" ]; then
    return
  fi
  echo "Running renewal check..."
  if certbot renew --quiet --webroot -w "$WEBROOT" \
      --config-dir "$CFG_DIR" --work-dir "$WORK_DIR" --logs-dir "$LOG_DIR" \
      --deploy-hook "/renew-hook.sh" > /tmp/certbot-renew.log 2>&1; then
    python3 -c "import json;json.dump({'ok':True,'lastRenew':'$(date -u +%Y-%m-%dT%H:%M:%SZ)','message':'renew check done'},open('$JOBS_DIR/renew-result.json','w'))"
  else
    python3 -c "import json;json.dump({'ok':False,'lastRenew':'$(date -u +%Y-%m-%dT%H:%M:%SZ)','message':'renew check failed'},open('$JOBS_DIR/renew-result.json','w'))"
  fi
}

LAST_RENEW_DAY=""
while true; do
  for job in "$JOBS_DIR"/issue.json; do
    [ -e "$job" ] && process_issue_job "$job"
  done

  day=$(date +%j)
  if [ "$day" != "$LAST_RENEW_DAY" ]; then
    renew_check
    LAST_RENEW_DAY=$day
  fi

  sleep 60
done
