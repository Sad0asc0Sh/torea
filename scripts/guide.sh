#!/usr/bin/env bash

# Generate a diagnostic guide file with key service snapshots.
# Output: <repo_root>/راهنما.txt

set -u

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_DIR" || exit 1

VIEW_DIR_LIMIT=20
SERVER_LINES=260
APP_LINES=320
ROUTER_SCAN_LINES=200
GUARD_SCAN_LINES=300
HEALTH_HOST="${HOST:-127.0.0.1}"
HEALTH_PORT="${PORT:-3000}"
case "$HEALTH_HOST" in
  "localhost"|"127.0.0.1") SAFE_HEALTH_HOST="$HEALTH_HOST" ;;
  *) SAFE_HEALTH_HOST="127.0.0.1" ;;
esac
if printf '%s' "$HEALTH_PORT" | grep -Eq '^[0-9]+$' && [ "$HEALTH_PORT" -ge 1 ] && [ "$HEALTH_PORT" -le 65535 ]; then
  SAFE_HEALTH_PORT="$HEALTH_PORT"
else
  SAFE_HEALTH_PORT="3000"
fi
OUT="${REPO_DIR}/راهنما.txt"
: > "$OUT"

{
  echo "==================== ToInfinity GUIDE (راهنما) ===================="
  date
  echo

  echo "==================== 1) PATH & DISK ===================="
  pwd
  ls -la
  echo

  echo "==================== 2) PM2 & HEALTHZ ===================="
  if command -v pm2 >/dev/null 2>&1; then
    pm2 status || true
  else
    echo "pm2 not installed"
  fi
  health_code="$(curl --max-time 10 --max-redirs 0 -s -o /dev/null -w "%{http_code}" "http://${SAFE_HEALTH_HOST}:${SAFE_HEALTH_PORT}/healthz" || true)"
  if [ -z "$health_code" ]; then
    echo "healthz=error url=http://${SAFE_HEALTH_HOST}:${SAFE_HEALTH_PORT}/healthz"
  else
    echo "healthz=${health_code} url=http://${SAFE_HEALTH_HOST}:${SAFE_HEALTH_PORT}/healthz"
  fi
  echo

  echo "==================== 3) PROJECT STRUCTURE ===================="
  ls -la src || true
  ls -la src/routes || true
  find src -maxdepth 3 -type d -name "views" -print 2>/dev/null | head -n "${VIEW_DIR_LIMIT}" || true
  echo

  echo "==================== 4) SERVER FILES ===================="
  echo "--- src/server.js ---"
  sed -n "1,${SERVER_LINES}p" src/server.js 2>/dev/null || echo "NOT FOUND: src/server.js"
  echo
  echo "--- src/app.js ---"
  sed -n "1,${APP_LINES}p" src/app.js 2>/dev/null || echo "NOT FOUND: src/app.js"
  echo

  echo "==================== 5) ROUTES & GUARDS QUICK SCAN ===================="
  echo "--- router refs ---"
  grep -R "router" -n src/routes 2>/dev/null | head -n "${ROUTER_SCAN_LINES}" || true
  echo
  echo "--- guards/session/rbac refs ---"
  grep -R -E "(requireSystemAdmin|enforceRole|guard|middleware|session)" -n src 2>/dev/null | head -n "${GUARD_SCAN_LINES}" || true
  echo

  echo "==================== 6) DB CHECK ===================="
  if [ -f .env ]; then
    if [ -z "${DATABASE_URL:-}" ]; then
      DATABASE_URL="$(grep -m1 '^DATABASE_URL=' .env | sed -e 's/^DATABASE_URL=//' -e 's/^\"//' -e "s/^'//" -e 's/\"$//' -e "s/'$//" || true)"
    fi
    if [ -z "${DATABASE_URL:-}" ]; then
      echo "DB: DATABASE_URL not set"
    else
      DB_CONN_URL="$(printf '%s' "$DATABASE_URL" | tr -d '\n\r')"
      if ! printf '%s' "$DB_CONN_URL" | grep -Eq '^postgres(ql)?://[^[:space:]@]+@[^[:space:]:/]+(:[0-9]{1,5})?/[^[:space:]]+$'; then
        echo "DB: DATABASE_URL invalid or non-postgres, skipping"
      else
        port_part="$(printf '%s' "$DB_CONN_URL" | sed -n 's/^postgres[^:]*:\/\/[^@]*@[^:\/]*:\([0-9]\{1,5\}\).*/\1/p')"
        if [ -n "$port_part" ] && { [ "$port_part" -lt 1 ] || [ "$port_part" -gt 65535 ]; }; then
          echo "DB: DATABASE_URL port out of range, skipping"
        else
          echo "DB: ping"
          if ! PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -P pager=off -c "SELECT now(), current_database(), current_user;"; then
            echo "PSQL FAILED (ping)"
          fi
          echo
          echo "DB: tables"
          if ! PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -P pager=off -c "\\dt"; then
            echo "PSQL FAILED (tables)"
          fi
          echo
          echo "DB: describe core tables"
          for t in users org_nodes org_credit_policy credit_sale_requests credit_settlement_requests; do
            echo "---- \\d $t ----"
            PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -P pager=off -c "\\d $t" || echo "NOT FOUND: $t"
            echo
          done
          echo "DB: definitions candidates"
          PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -P pager=off -c "\\dt *team*" || true
          PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -P pager=off -c "\\dt *brand*" || true
          PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -P pager=off -c "\\dt *product*" || true
        fi
      fi
    fi
  else
    echo "NO .env FOUND"
  fi

} | tee "$OUT"

echo
echo "✅ CREATED: $OUT"
echo "===== LAST 40 LINES ====="
tail -n 40 "$OUT"
