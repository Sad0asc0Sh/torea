#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"

status() {
  local path="$1"
  curl -s -o /dev/null -w "%{http_code}" "${BASE_URL}${path}"
}

echo "Checking public endpoints (no session)..."
echo "  /login              -> $(status /login)"
echo "  /register           -> $(status /register)"
echo "  /pre-register-info  -> $(status /pre-register-info)"
echo "  /auth/telegram      -> $(status /auth/telegram)"

tg_head=$(curl -s -o /dev/null -w "%{http_code} %{redirect_url}" "${BASE_URL}/auth/telegram")
echo "Redirect check /auth/telegram (no session): ${tg_head}"

echo
echo "Validating EJS templates..."
node "$(dirname "$0")/validate-ejs.js"
