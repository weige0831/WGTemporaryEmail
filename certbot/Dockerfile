# Let's Encrypt sidecar: issues and renews certificates via HTTP-01 webroot.
FROM certbot/certbot:latest

COPY entry.sh /entry.sh
COPY renew-hook.sh /renew-hook.sh
RUN chmod +x /entry.sh /renew-hook.sh

ENTRYPOINT ["/bin/sh", "/entry.sh"]
