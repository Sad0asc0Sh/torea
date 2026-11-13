#!/usr/bin/env bash
set -e

APP_DIR="/opt/bria-app"
cd "$APP_DIR" || exit 1

if [ ! -f .env ]; then
  echo "❌ فایل .env توی $APP_DIR پیدا نشد."
  exit 1
fi

# خواندن مقادیر قبلی از .env
TELEGRAM_BOT_TOKEN=$(grep -E "^TELEGRAM_BOT_TOKEN=" .env | sed "s/^TELEGRAM_BOT_TOKEN=//")
APP_BASE_URL=$(grep -E "^APP_BASE_URL=" .env | sed "s/^APP_BASE_URL=//")

if [ -z "$TELEGRAM_BOT_TOKEN" ]; then
  echo "❌ متغیر TELEGRAM_BOT_TOKEN توی .env ست نشده."
  echo "   یک بار از منوی ابزار گزینه «۳) تنظیم / تغییر Bot Token» را اجرا کن."
  exit 1
fi

if [ -z "$APP_BASE_URL" ]; then
  echo "❌ متغیر APP_BASE_URL توی .env ست نشده."
  echo "   اول اسکریپت 02_setup_telegram_env.sh را اجرا کن."
  exit 1
fi

WEBHOOK_URL="${APP_BASE_URL%/}/telegram/webhook"

echo "📡 در حال تنظیم وب‌هوک روی:"
echo "    $WEBHOOK_URL"
echo

API_URL="https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook"

RESP=$(curl -sS -X POST "$API_URL" \
  -d "url=$WEBHOOK_URL" \
  -d "allowed_updates=[\"message\",\"callback_query\"]")

echo "پاسخ تلگرام:"
echo "$RESP"
echo

if echo "$RESP" | grep -q "\"ok\":true"; then
  echo "✅ وب‌هوک با موفقیت ست شد."
else
  echo "⚠️ ظاهراً مشکلی در ست‌کردن وب‌هوک وجود دارد."
fi
