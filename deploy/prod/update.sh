#!/usr/bin/env bash
# Боевой сайт: забрать сборку из ветки prod-build (её делает GitHub Actions), проверить и подменить файлы. Cron раз в 5 минут.
set -euo pipefail
exec 9>/run/cvety-prod.lock; flock -n 9 || exit 0
cd /opt/cvety-prod
[ -d repo/.git ] || git clone -q --depth 1 --single-branch -b prod-build https://github.com/Deford2027/tsvetibezpovoda.git repo
cd repo
git fetch -q --depth 1 origin prod-build
NEW=$(git rev-parse FETCH_HEAD)
[ "$NEW" = "$(cat ../current 2>/dev/null || true)" ] && exit 0
git reset -q --hard FETCH_HEAD
test -s site/index.html; test -s site/sitemap.xml; test -s redirects.map
grep -q lock-form site/admin/leads/index.html           # админка закрыта
grep -q 'https://tsvetibezpovoda.ru/' site/index.html    # сборка боевая
! grep -q 'noindex' site/index.html
mkdir -p ../dist ../redirects
rsync -rlt --delete --chmod=D755,F644 site/ ../dist/
cat redirects.map > ../redirects/redirects.map; chmod 644 ../redirects/redirects.map
cp ../../cvety/nginx.conf ../nginx.conf.new && cat ../nginx.conf.new > ../nginx.conf && rm ../nginx.conf.new
cd .. && docker compose up -d >/dev/null 2>&1
docker exec cvety-prod-web nginx -t 2>/dev/null && docker exec cvety-prod-web nginx -s reload 2>/dev/null
echo "$NEW" > current
