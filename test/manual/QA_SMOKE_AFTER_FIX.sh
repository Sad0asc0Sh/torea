#!/usr/bin/env bash

# QA / Smoke Test Script (post-fix)
# Requirements:
#   1) Restart pm2 app (default: "toinfinity"), wait for /healthz=200
#   2) Clear logs, hit key endpoints, then ensure no new PM2 errors
#   3) Verify DB schema columns and basic counts
#   4) Run `npm test` and store output in a timestamped file
#   5) Emit a PASS/FAIL summary per section
# Hard rules: idempotent, no data deletion, no secret exposure

set -u

timestamp() { date '+%Y-%m-%d %H:%M:%S'; }
log() { printf '[%s] %s\n' "$(timestamp)" "$*"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEFAULT_ROOT="/root/ToInfinity"
if [ -d "$DEFAULT_ROOT" ]; then
  REPO_DIR="$DEFAULT_ROOT"
else
  REPO_DIR="$SCRIPT_DIR"
fi
cd "$REPO_DIR" || { echo "Cannot cd into repo dir: $REPO_DIR"; exit 1; }

SAFE_HOST_INPUT="${HOST:-127.0.0.1}"
case "$SAFE_HOST_INPUT" in
  "localhost"|"127.0.0.1"|"::1") SAFE_HOST="$SAFE_HOST_INPUT" ;;
  *) SAFE_HOST="127.0.0.1" ;;
esac
PORT_INPUT="${PORT:-3000}"
if [[ "$PORT_INPUT" =~ ^[0-9]+$ ]] && [ "$PORT_INPUT" -gt 0 ] && [ "$PORT_INPUT" -le 65535 ]; then
  SAFE_PORT="$PORT_INPUT"
else
  SAFE_PORT="3000"
fi
BASE_URL="http://${SAFE_HOST}:${SAFE_PORT}"

QA_OUT_DIR="${REPO_DIR}/qa_smoke_logs"
mkdir -p "$QA_OUT_DIR"
TS="$(date +%Y%m%d-%H%M%S)"
HTTP_LOG="${QA_OUT_DIR}/http-checks-${TS}.log"
PM2_LOG_SNAPSHOT="${QA_OUT_DIR}/pm2-${TS}.log"
TEST_LOG="${QA_OUT_DIR}/npm-test-${TS}.log"
DB_LOG="${QA_OUT_DIR}/db-checks-${TS}.log"

STATUS_PM2="FAIL"
STATUS_HTTP="FAIL"
STATUS_PM2_LOGS="FAIL"
STATUS_DB_SCHEMA="SKIP"
STATUS_DB_COUNTS="SKIP"
STATUS_TESTS="FAIL"

PM2_TARGET="${PM2_NAME:-toinfinity}"
HTTP_RESULTS=()
HTTP_FAILS=()
DB_SCHEMA_FAILS=()
DB_COUNT_OUTPUT=""

restart_pm2_app() {
  if ! command -v pm2 >/dev/null 2>&1; then
    log "pm2 not installed; skipping restart"
    return 1
  fi

  local candidates=()
  [ -n "${PM2_NAME:-}" ] && candidates+=("${PM2_NAME}")
  candidates+=("toinfinity" "bria-app")

  local seen=""
  local chosen=""
  for name in "${candidates[@]}"; do
    if printf '%s' "$seen" | grep -q "|${name}|"; then
      continue
    fi
    seen="${seen}|${name}|"
    if pm2 describe "$name" >/dev/null 2>&1; then
      chosen="$name"
      break
    fi
  done

  if [ -z "$chosen" ]; then
    log "pm2 app not found (tried: ${candidates[*]}), falling back to 'all'"
    chosen="all"
  fi

  PM2_TARGET="$chosen"
  log "Restarting pm2 app: ${PM2_TARGET}"
  pm2 restart "$PM2_TARGET" --update-env >/dev/null 2>&1 || pm2 restart "$PM2_TARGET" >/dev/null 2>&1 || true

  # Clear logs to isolate new errors
  pm2 flush "$PM2_TARGET" >/dev/null 2>&1 || pm2 flush >/dev/null 2>&1 || true
  return 0
}

wait_for_healthz() {
  local max_attempts=15
  local delay=3
  local code=""
  for attempt in $(seq 1 "$max_attempts"); do
    code="$(curl --max-time 8 --max-redirs 0 -s -o /dev/null -w "%{http_code}" "${BASE_URL}/healthz" || true)"
    if [ "$code" = "200" ]; then
      log "healthz=200 on attempt ${attempt}"
      return 0
    fi
    sleep "$delay"
  done
  log "healthz not 200 (last code: ${code:-none})"
  return 1
}

check_http_endpoints() {
  : > "$HTTP_LOG"
  local endpoints=(
    "/admin/definitions/teams|200 302"
    "/admin/definitions/products|200 302"
    "/admin/definitions/brands|200 302"
    "/admin/definitions/credit-policy|200 302"
    "/admin/definitions/baskets|410 404 301 302"
  )

  for entry in "${endpoints[@]}"; do
    local path expected code
    path="${entry%%|*}"
    expected="${entry#*|}"
    code="$(curl --max-time 12 --max-redirs 0 -s -o /dev/null -w "%{http_code}" "${BASE_URL}${path}" || true)"
    HTTP_RESULTS+=("${path}:${code}")
    printf '%s %s -> %s\n' "$BASE_URL" "$path" "$code" >> "$HTTP_LOG"
    if printf ' %s ' "$expected" | grep -q " ${code} "; then
      continue
    else
      HTTP_FAILS+=("${path} (got ${code}, expected ${expected})")
    fi
  done

  if [ ${#HTTP_FAILS[@]} -eq 0 ]; then
    STATUS_HTTP="PASS"
    log "HTTP checks passed (details in $HTTP_LOG)"
  else
    STATUS_HTTP="FAIL"
    log "HTTP checks failed:"
    for f in "${HTTP_FAILS[@]}"; do
      log "  - ${f}"
    done
    log "Full HTTP log: $HTTP_LOG"
  fi
}

check_pm2_logs() {
  if ! command -v pm2 >/dev/null 2>&1; then
    log "pm2 not installed; skipping log scan"
    STATUS_PM2_LOGS="FAIL"
    return
  fi

  pm2 logs "$PM2_TARGET" --lines 200 --nostream > "$PM2_LOG_SNAPSHOT" 2>&1 || \
    pm2 logs --lines 200 --nostream > "$PM2_LOG_SNAPSHOT" 2>&1 || true

  if grep -Ei '\b(error|uncaught|unhandled)\b' "$PM2_LOG_SNAPSHOT" >/dev/null 2>&1; then
    STATUS_PM2_LOGS="FAIL"
    log "PM2 log scan found possible errors (see $PM2_LOG_SNAPSHOT)"
  else
    STATUS_PM2_LOGS="PASS"
    log "PM2 log scan clean (see $PM2_LOG_SNAPSHOT)"
  fi
}

prepare_db_url() {
  if [ -f .env ]; then
    local env_perm
    env_perm="$(stat -c '%a' .env 2>/dev/null || echo 600)"
    if [[ ! "$env_perm" =~ ^[0-9]+$ ]]; then
      env_perm=600
    fi
    if [ "$env_perm" -gt 640 ] 2>/dev/null; then
      log ".env permissions are $env_perm (consider 640 or stricter) before reading DATABASE_URL"
    fi
  fi

  DB_CONN_URL="${DATABASE_URL:-}"
  if [ -z "${DB_CONN_URL:-}" ] && [ -f .env ]; then
    DB_CONN_URL="$(grep -m1 '^DATABASE_URL=' .env | cut -d= -f2- | tr -d '\r')"
    DB_CONN_URL="${DB_CONN_URL%\"}"
    DB_CONN_URL="${DB_CONN_URL#\"}"
    DB_CONN_URL="${DB_CONN_URL%\'}"
    DB_CONN_URL="${DB_CONN_URL#\'}"
  fi

  if [ -n "${PGSERVICE:-}" ]; then
    DB_CONN_URL="service=${PGSERVICE}"
  fi

  if [ -z "${DB_CONN_URL:-}" ]; then
    log "DATABASE_URL not set; skipping DB checks"
    return 1
  fi

  if [[ ! "$DB_CONN_URL" =~ ^postgres(ql)?:// ]]; then
    log "DATABASE_URL format invalid; skipping DB checks"
    return 1
  fi

  return 0
}

check_db_schema_and_counts() {
  : > "$DB_LOG"
  if ! command -v psql >/dev/null 2>&1; then
    log "psql not installed; skipping DB checks"
    STATUS_DB_SCHEMA="FAIL"
    STATUS_DB_COUNTS="FAIL"
    return
  fi

  if ! prepare_db_url; then
    STATUS_DB_SCHEMA="FAIL"
    STATUS_DB_COUNTS="FAIL"
    return
  fi

  local tables_ok=1
  local teams_col uta_updated_col uta_role_col

  log "Running DB schema checks (output: $DB_LOG)"
  {
    for t in teams team_users user_team_assignment products; do
      echo "== \\d+ ${t} =="
      PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -P pager=off -c "\\d+ ${t}" || true
      echo
    done
  } >> "$DB_LOG"

  teams_col="$(PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -tA -c "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND lower(table_name)='teams' AND lower(column_name)='org_node_id' LIMIT 1;" 2>/dev/null || true)"
  uta_updated_col="$(PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -tA -c "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND lower(table_name)='user_team_assignment' AND lower(column_name)='updated_at' LIMIT 1;" 2>/dev/null || true)"
  uta_role_col="$(PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -tA -c "SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND lower(table_name)='user_team_assignment' AND lower(column_name)='role' LIMIT 1;" 2>/dev/null || true)"

  if [ "$teams_col" != "1" ]; then
    tables_ok=0
    DB_SCHEMA_FAILS+=("teams missing org_node_id")
  fi
  if [ "$uta_updated_col" != "1" ]; then
    tables_ok=0
    DB_SCHEMA_FAILS+=("user_team_assignment missing updated_at")
  fi
  if [ "$uta_role_col" = "1" ]; then
    tables_ok=0
    DB_SCHEMA_FAILS+=("user_team_assignment should not have role column")
  fi

  if [ $tables_ok -eq 1 ]; then
    STATUS_DB_SCHEMA="PASS"
  else
    STATUS_DB_SCHEMA="FAIL"
  fi

  local missing_tables=()
  for t in teams team_users user_team_assignment products; do
    local has_table
    has_table="$(PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -tA -c "SELECT 1 FROM information_schema.tables WHERE table_schema = current_schema() AND table_name='${t}' LIMIT 1;" 2>/dev/null || true)"
    if [ "$has_table" != "1" ]; then
      missing_tables+=("$t")
    fi
  done

  if [ ${#missing_tables[@]} -gt 0 ]; then
    STATUS_DB_COUNTS="FAIL"
    DB_COUNT_OUTPUT="missing tables: ${missing_tables[*]}"
    {
      echo "== counts (table,count) =="
      echo "$DB_COUNT_OUTPUT"
      echo
    } >> "$DB_LOG"
    return
  fi

  DB_COUNT_OUTPUT="$(PGCONNECT_TIMEOUT=10 psql "$DB_CONN_URL" -tA -F ',' -c "SELECT 'teams' AS table_name, COUNT(*) FROM teams UNION ALL SELECT 'team_users', COUNT(*) FROM team_users UNION ALL SELECT 'user_team_assignment', COUNT(*) FROM user_team_assignment UNION ALL SELECT 'products', COUNT(*) FROM products;" 2>/dev/null || true)"

  if [ -n "$DB_COUNT_OUTPUT" ]; then
    STATUS_DB_COUNTS="PASS"
    {
      echo "== counts (table,count) =="
      echo "$DB_COUNT_OUTPUT"
      echo
    } >> "$DB_LOG"
  else
    STATUS_DB_COUNTS="FAIL"
    {
      echo "== counts (teams, team_users, products) =="
      echo "FAILED to read counts"
      echo
    } >> "$DB_LOG"
  fi
}

run_tests() {
  log "Running npm test (output: $TEST_LOG)"
  if [ ! -d node_modules ]; then
    log "node_modules missing; tests may fail. Run 'npm ci' first if needed."
  fi
  if npm test > "$TEST_LOG" 2>&1; then
    STATUS_TESTS="PASS"
  else
    STATUS_TESTS="FAIL"
  fi
}

print_summary() {
  echo
  echo "===== QA / SMOKE SUMMARY ====="
  printf 'PM2 & healthz     : %s\n' "$STATUS_PM2"
  printf 'HTTP endpoints    : %s\n' "$STATUS_HTTP"
  printf 'PM2 log scan      : %s\n' "$STATUS_PM2_LOGS"
  printf 'DB schema columns : %s\n' "$STATUS_DB_SCHEMA"
  printf 'DB counts         : %s\n' "$STATUS_DB_COUNTS"
  printf 'npm test          : %s\n' "$STATUS_TESTS"
  echo "Artifacts:"
  echo "  - HTTP log: $HTTP_LOG"
  echo "  - PM2 snapshot: $PM2_LOG_SNAPSHOT"
  echo "  - DB log: $DB_LOG"
  echo "  - npm test log: $TEST_LOG"
  echo

  if [ ${#HTTP_FAILS[@]} -gt 0 ]; then
    echo "HTTP failures:"
    for f in "${HTTP_FAILS[@]}"; do
      echo "  - $f"
    done
    echo
  fi

  if [ ${#DB_SCHEMA_FAILS[@]} -gt 0 ]; then
    echo "DB schema issues:"
    for f in "${DB_SCHEMA_FAILS[@]}"; do
      echo "  - $f"
    done
    echo
  fi

  if [ -n "$DB_COUNT_OUTPUT" ]; then
    echo "DB counts (teams,team_users,user_team_assignment,products): $DB_COUNT_OUTPUT"
    echo
  fi
}

# -------- Main flow --------
log "Starting QA smoke in $REPO_DIR (base URL: $BASE_URL)"

if restart_pm2_app && wait_for_healthz; then
  STATUS_PM2="PASS"
else
  STATUS_PM2="FAIL"
fi

check_http_endpoints
check_pm2_logs
check_db_schema_and_counts
run_tests
print_summary

# Exit non-zero if any required section failed
EXIT_CODE=0
for s in "$STATUS_PM2" "$STATUS_HTTP" "$STATUS_PM2_LOGS" "$STATUS_DB_SCHEMA" "$STATUS_DB_COUNTS" "$STATUS_TESTS"; do
  if [ "$s" = "FAIL" ]; then
    EXIT_CODE=1
    break
  fi
done
exit $EXIT_CODE
