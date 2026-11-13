#!/usr/bin/env bash
set -e
APP_DIR="/opt/bria-app"
cd "$APP_DIR" || exit 1

if [ ! -f .env ]; then
  echo ".env پیدا نشد."
  exit 1
fi

TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' .env | sed 's/^TELEGRAM_BOT_TOKEN=//')
if [ -z "$TOKEN" ]; then
  echo "TELEGRAM_BOT_TOKEN در .env تنظیم نشده."
  exit 1
fi

echo "TOKEN: $TOKEN"

read -rp "یوزرنیم/آیدی تلگرام (مثلاً @YourUser): " CHAT

echo "در حال ارسال پیام تست به $CHAT ..."
curl -s "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  -H 'Content-Type: application/json' \
  -d "{\"chat_id\":\"${CHAT}\",\"text\":\"تست مستقیم از سرور BRIA\"}"
echo
