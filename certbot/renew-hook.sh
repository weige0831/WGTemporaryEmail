#!/bin/sh
# Copies the renewed certificate to the shared certs directory. Invoked by
# certbot as a deploy-hook after every successful renewal.
set -e
cp -L "$RENEWED_LINEAGE/fullchain.pem" /certbot-data/certs/cert.pem
cp -L "$RENEWED_LINEAGE/privkey.pem" /certbot-data/certs/key.pem
chmod 644 /certbot-data/certs/cert.pem /certbot-data/certs/key.pem
echo "Renewed certificates copied to /certbot-data/certs"
