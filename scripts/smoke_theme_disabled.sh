#!/usr/bin/env bash

PORT=${PORT:-3000}
BASE_URL=${BASE_URL:-"http://127.0.0.1:${PORT}"}
fail=0

echo "== pm2 status =="
if command -v pm2 >/dev/null 2>&1; then
  pm2 status || pm2 ls || true
else
  echo "pm2 not installed; skipping pm2 status check"
fi

echo "== port ${PORT} =="
if command -v nc >/dev/null 2>&1; then
  if nc -z 127.0.0.1 "${PORT}"; then
    echo "Port ${PORT} is listening"
  else
    echo "Port ${PORT} is not reachable"
    fail=1
  fi
elif command -v lsof >/dev/null 2>&1; then
  lsof -i :"${PORT}" || true
else
  echo "No port probing tool available (nc/lsof missing)"
fi

check_url() {
  local url="$1"
  local code
  code=$(curl -k -s -o /dev/null -w "%{http_code}" "${url}")
  echo "-> ${url} : ${code}"
  if [[ "${code}" == "000" || "${code}" =~ ^5[0-9][0-9]$ ]]; then
    echo "   unexpected status for ${url}"
    fail=1
  fi
}

echo "== smoke endpoints =="
check_url "${BASE_URL}/login"
check_url "${BASE_URL}/admin/login"
check_url "${BASE_URL}/admin/definitions"
check_url "${BASE_URL}/admin/definitions/brands"

exit "${fail}"
