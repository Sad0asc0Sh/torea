#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR" || exit 1

PORT="${PORT:-3000}"
HOST_HEADER="${HOST_HEADER:-alamis.info}"
BASE_URL="http://127.0.0.1:${PORT}"

echo "== npm test =="
if npm test; then
  echo "[PASS] npm test"
else
  echo "[WARN] npm test failed (continuing)"
fi

SERVER_LOG="$(mktemp)"
SERVER_PID=""

start_server() {
  if [ -n "${SKIP_UI_SMOKE_SERVER:-}" ]; then
    return
  fi
  PORT="$PORT" node src/server.js >"$SERVER_LOG" 2>&1 &
  SERVER_PID=$!
}

wait_for_health() {
  local attempts=0
  while [ $attempts -lt 10 ]; do
    local code
    code="$(curl -s -o /dev/null -H "Host: ${HOST_HEADER}" -w "%{http_code}" "${BASE_URL}/healthz" || true)"
    if [ "$code" = "200" ]; then
      return 0
    fi
    attempts=$((attempts+1))
    sleep 1
  done
  return 1
}

stop_server() {
  if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
    kill "$SERVER_PID" >/dev/null 2>&1 || true
  fi
}

curl_check() {
  local path="$1"
  curl -s -o /dev/null -H "Host: ${HOST_HEADER}" -w "${path} status:%{http_code} time_total:%{time_total}\n" "${BASE_URL}${path}" || \
    echo "${path} status:000 time_total:0"
}

start_server
if [ -n "$SERVER_PID" ] && kill -0 "$SERVER_PID" 2>/dev/null; then
  if ! wait_for_health; then
    echo "[WARN] server failed healthz probe; curl checks may fail"
    head -n 20 "$SERVER_LOG" || true
  fi
else
  echo "[WARN] server failed to start; curl checks may fail"
fi

echo "== HTTP checks =="
curl_check "/healthz"
curl_check "/admin/login"
curl_check "/admin/definitions/teams"
curl_check "/admin/definitions/hierarchy"

stop_server

echo "Server log: ${SERVER_LOG}"
