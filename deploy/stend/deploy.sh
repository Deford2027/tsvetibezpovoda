#!/usr/bin/env bash
# Выкладка стенда: сборка из текущей папки, замок админки, архив по ssh в firstvds-msk:/opt/cvety/dist.
set -euo pipefail
cd "$(dirname "$0")/../.."
export PATH="$HOME/.local/node/bin:$PATH"
HOST=cvety.168.113.179.49.nip.io
PUBLIC_BASE=/ PUBLIC_SITE_URL="https://$HOST" PUBLIC_NOINDEX=1 npm run build
ADMIN_LOGIN="$(cat ~/.config/tsvetibezpovoda/admin-login)" ADMIN_PASS="$(cat ~/.config/tsvetibezpovoda/admin-pass)" node scripts/lock-admin.mjs
grep -q lock-form dist/admin/products/index.html
node scripts/nginx-redirects.mjs > /tmp/cvety-redirects.map
ssh firstvds-msk 'mkdir -p /opt/cvety/redirects'
scp -q /tmp/cvety-redirects.map firstvds-msk:/opt/cvety/redirects/redirects.map
scp -q deploy/stend/compose.yml deploy/stend/nginx.conf firstvds-msk:/opt/cvety/
tar -C dist -czf - . | ssh firstvds-msk 'set -e
rm -rf /opt/cvety/dist.new; mkdir -p /opt/cvety/dist.new
tar -C /opt/cvety/dist.new --no-same-owner -xzf -
test -f /opt/cvety/dist.new/index.html
rsync -rlt --delete --chmod=D755,F644 /opt/cvety/dist.new/ /opt/cvety/dist/
rm -rf /opt/cvety/dist.new
cd /opt/cvety && docker compose up -d && docker compose restart cvety-web'
