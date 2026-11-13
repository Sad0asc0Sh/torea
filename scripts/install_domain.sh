#!/usr/bin/env bash
set -euo pipefail

DOMAIN="${1:-}"
APP_PORT="${APP_PORT:-3000}"

if [[ -z "$DOMAIN" ]]; then
  echo "Usage: $0 alamis.info"
  exit 1
fi

echo "== Install/Bind domain: $DOMAIN =="

# 1) sanity: app running?
echo "Checking app on localhost:$APP_PORT ..."
CODE_APP="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1:${APP_PORT}/healthz" || true)"
echo "APP healthz: $CODE_APP"
if [[ "$CODE_APP" != "200" ]]; then
  echo "❌ App is not healthy on port ${APP_PORT}. Make sure pm2 'toinfinity' is online."
  exit 2
fi

# 2) nginx check
sudo nginx -t

# 3) write nginx site config
NGX="/etc/nginx/sites-available/${DOMAIN}.conf"
sudo tee "$NGX" >/dev/null <<NGINX
server {
  listen 80;
  server_name ${DOMAIN} www.${DOMAIN};

  location / {
    proxy_pass http://127.0.0.1:${APP_PORT};
    proxy_http_version 1.1;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
}
NGINX

# 4) enable site
sudo ln -sf "$NGX" "/etc/nginx/sites-enabled/${DOMAIN}.conf"

# 5) reload nginx
sudo nginx -t
sudo systemctl reload nginx

# 6) test http
CODE_HTTP="$(curl -s -o /dev/null -w "%{http_code}" "http://127.0.0.1/healthz" || true)"
echo "NGINX local /healthz: $CODE_HTTP"

# 7) test https (if already configured)
CODE_HTTPS="$(curl -k -s -o /dev/null -w "%{http_code}" "https://${DOMAIN}/healthz" || true)"
echo "HTTPS domain /healthz: $CODE_HTTPS"

echo "✅ Done."
echo "Open: https://${DOMAIN}"
