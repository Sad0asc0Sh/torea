#!/usr/bin/env bash
set -e

APP_DIR="/opt/bria-app"
ENV_FILE="$APP_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠ فایل .env پیدا نشد: $ENV_FILE"
  exit 1
fi

echo "======================================="
echo "  تنظیم APP_BASE_URL و TELEGRAM_BOT_TOKEN"
echo "======================================="

read -p "آدرس پایه اپ (مثلاً https://alamis.info) : " BASE_URL
read -p "Telegram Bot Token : " BOT_TOKEN

if [ -z "$BASE_URL" ] || [ -z "$BOT_TOKEN" ]; then
  echo "⚠ مقدارها خالی است، عملیات لغو شد."
  exit 1
fi

cp "$ENV_FILE" "$ENV_FILE.bak_env_$(date +%Y%m%d_%H%M%S)"

# پاک‌کردن خطوط قدیمی
grep -v '^APP_BASE_URL=' "$ENV_FILE" | grep -v '^TELEGRAM_BOT_TOKEN=' > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"

# اضافه کردن مقدارهای جدید
{
  echo "APP_BASE_URL=$BASE_URL"
  echo "TELEGRAM_BOT_TOKEN=$BOT_TOKEN"
} >> "$ENV_FILE"

echo "✅ APP_BASE_URL و TELEGRAM_BOT_TOKEN تنظیم شدند."
