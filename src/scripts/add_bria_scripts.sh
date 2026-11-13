#!/usr/bin/env bash
set -e

echo "===> Adding scripts to /root/bria-scripts ..."
mkdir -p /root/bria-scripts   # اگر قبلاً بوده، مشکلی ندارد

############################################
# Script 1: Nginx config for alamis.info
############################################
cat << 'NGINXEOF' > /root/bria-scripts/01_nginx_domain_alamis.sh
#!/usr/bin/env bash
set -e

DOMAIN="alamis.info"
APP_PORT=3000
NGCONF_DIR="/etc/nginx/sites-available"
NGCONF_FILE="$NGCONF_DIR/bria-app"
NGCONF_ENABLED="/etc/nginx/sites-enabled/bria-app"

echo "===> Setting up Nginx vhost for $DOMAIN (proxy to 127.0.0.1:$APP_PORT) ..."

if [ -f "$NGCONF_FILE" ]; then
  TS=$(date +%Y%m%d_%H%M%S)
  echo " - Backup old $NGCONF_FILE -> ${NGCONF_FILE}.bak_${TS}"
  cp "$NGCONF_FILE" "${NGCONF_FILE}.bak_${TS}"
fi

cat << CONF > "$NGCONF_FILE"
server {
    listen 80;
    listen [::]:80;
    server_name $DOMAIN www.$DOMAIN;

    location / {
        proxy_pass         http://127.0.0.1:$APP_PORT;
        proxy_http_version 1.1;
        proxy_set_header   X-Real-IP        \$remote_addr;
        proxy_set_header   X-Forwarded-For  \$proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto \$scheme;
        proxy_set_header   Host             \$host;
        proxy_set_header   Upgrade          \$http_upgrade;
        proxy_set_header   Connection       "upgrade";
    }
}
CONF

echo "===> Enabling site ..."
ln -sfn "$NGCONF_FILE" "$NGCONF_ENABLED"

echo "===> Testing nginx config ..."
nginx -t

echo "===> Reloading nginx ..."
systemctl reload nginx

echo "===> DONE: http://$DOMAIN فعال خواهد شد پس از اتصال DNS/Cloudflare."
NGINXEOF

chmod +x /root/bria-scripts/01_nginx_domain_alamis.sh


############################################
# Script 2: Telegram token setter
############################################
cat << 'TGEOF' > /root/bria-scripts/02_setup_telegram_env.sh
#!/usr/bin/env bash
set -e

APP_DIR="/opt/bria-app"
ENV_FILE="$APP_DIR/.env"

if [ ! -d "$APP_DIR" ]; then
  echo "❌ App directory not found: $APP_DIR"
  exit 1
fi

cd "$APP_DIR"

echo "===> Existing .env (Telegram removed):"
grep -v "TELEGRAM_BOT_TOKEN" "$ENV_FILE" 2>/dev/null || true
echo

read -rp "🔑 Enter Telegram BOT token: " BOT_TOKEN
read -rp "🌐 Enter APP base URL (default: https://alamis.info): " BASE_URL

if [ -z "$BASE_URL" ]; then
  BASE_URL="https://alamis.info"
  echo "Using default BASE_URL: $BASE_URL"
fi

TS=$(date +%Y%m%d_%H%M%S)
cp "$ENV_FILE" "${ENV_FILE}.bak_${TS}"

grep -v "^TELEGRAM_BOT_TOKEN=" "$ENV_FILE" | \
grep -v "^APP_BASE_URL=" > "${ENV_FILE}.tmp" || true

echo "TELEGRAM_BOT_TOKEN=${BOT_TOKEN}" >> "${ENV_FILE}.tmp"
echo "APP_BASE_URL=${BASE_URL}"       >> "${ENV_FILE}.tmp"

mv "${ENV_FILE}.tmp" "$ENV_FILE"

echo "===> .env updated successfully."
echo "برای اعمال باید pm2 را آپدیت env کنید:"
echo "pm2 restart bria-app --update-env"
TGEOF

chmod +x /root/bria-scripts/02_setup_telegram_env.sh


echo "======================================================="
echo "Scripts added to /root/bria-scripts:"
ls -la /root/bria-scripts
echo "======================================================="
echo "Run after DNS ready:"
echo "  bash /root/bria-scripts/01_nginx_domain_alamis.sh"
echo "Run to add Telegram Token:"
echo "  bash /root/bria-scripts/02_setup_telegram_env.sh"
