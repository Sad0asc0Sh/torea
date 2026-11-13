#!/usr/bin/env bash
set -euo pipefail

APP="/opt/bria-app"
cd "$APP"

ts="$(date +%F_%H%M%S)"
BKP="/opt/bria-backups/$ts"
mkdir -p "$BKP"

echo "== Backup files =="
cp -a server.js routes views public package.json package-lock.json "$BKP/" 2>/dev/null || true
echo "Backup saved in: $BKP"

echo "== Load env (if exists) =="
if [ -f "$APP/.env" ]; then
  set -a
  source "$APP/.env"
  set +a
fi

echo "== Optional DB backup (pg_dump) =="
if [ -n "${DATABASE_URL:-}" ]; then
  pg_dump "$DATABASE_URL" > "$BKP/bria_db.sql" 2>/dev/null || true
  echo "DB dump: $BKP/bria_db.sql"
else
  echo "DATABASE_URL not exported (ok)."
fi

ADMIN_JS="$APP/routes/admin.js"
if [ ! -f "$ADMIN_JS" ]; then
  echo "ERROR: $ADMIN_JS not found"
  exit 1
fi

echo "== Fix: remove duplicate Pool require / duplicate pool init in routes/admin.js =="
tmp="$ADMIN_JS.tmp.$$"

awk '
BEGIN{cPoolReq=0; cPoolInit=0}
{
  # keep only first: const { Pool } = require("pg");
  if ($0 ~ /const[[:space:]]+\{[[:space:]]*Pool[[:space:]]*\}[[:space:]]*=[[:space:]]*require\([[:space:]]*['\''"]pg['\''"][[:space:]]*\);/) {
    cPoolReq++;
    if (cPoolReq>1) next;
  }

  # keep only first: const pool = new Pool(
  if ($0 ~ /const[[:space:]]+pool[[:space:]]*=[[:space:]]*new[[:space:]]+Pool[[:space:]]*\(/) {
    cPoolInit++;
    if (cPoolInit>1) next;
  }

  print $0
}
' "$ADMIN_JS" > "$tmp"

mv -f "$tmp" "$ADMIN_JS"

echo "== Syntax check =="
node --check "$APP/server.js"
node --check "$APP/routes/admin.js"

echo "== Restart pm2 =="
pm2 restart bria-app

echo "== Quick local check =="
sleep 1
curl -s -I http://127.0.0.1:3000/ | head -n 5 || true
curl -s -I http://127.0.0.1:3000/admin/dashboard | head -n 5 || true

echo "DONE."
