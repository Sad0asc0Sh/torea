#!/usr/bin/env bash
set -e

DOMAIN="alamis.info"
WWW_DOMAIN="www.alamis.info"
NODE_PORT=3000

echo "======================================="
echo "  تنظیم Nginx برای دامنه $DOMAIN"
echo "======================================="

if ! command -v nginx >/dev/null 2>&1; then
  echo "⚙ در حال نصب nginx ..."
  apt update -y
  apt install -y nginx
fi

NG_CONF="/etc/nginx/sites-available/$DOMAIN"

cat << NGC > "$NG_CONF"
server {
    listen 80;
    listen [::]:80;

    server_name $DOMAIN $WWW_DOMAIN;

    location / {
        proxy_pass         http://127.0.0.1:$NODE_PORT;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade \$http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host \$host;
        proxy_cache_bypass \$http_upgrade;
    }
}
NGC

ln -sf "$NG_CONF" /etc/nginx/sites-enabled/$DOMAIN

if [ -f /etc/nginx/sites-enabled/default ]; then
  rm -f /etc/nginx/sites-enabled/default
fi

echo "🔍 تست کانفیگ nginx ..."
nginx -t

echo "🔄 ری‌لود nginx ..."
systemctl reload nginx

echo
echo "✅ Nginx برای $DOMAIN آماده است."
echo "برای فعال‌سازی SSL (LetsEncrypt) بعداً می‌توانی این را اجرا کنی:"
echo "  apt install -y certbot python3-certbot-nginx"
echo "  certbot --nginx -d $DOMAIN -d $WWW_DOMAIN"
