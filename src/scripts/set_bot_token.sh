#!/usr/bin/env bash
set -e

APP_DIR="/opt/bria-app"
ENV_FILE="$APP_DIR/.env"

if [ ! -f "$ENV_FILE" ]; then
  echo "⚠ فایل .env پیدا نشد: $ENV_FILE"
  exit 1
fi

echo "======================================="
echo "  تنظیم Telegram Bot Token"
echo "======================================="
read -p "Bot Token جدید تلگرام را وارد کن: " TOKEN

if [ -z "$TOKEN" ]; then
  echo "⚠ Token خالی است، تغییری اعمال نشد."
  exit 1
fi

cp "$ENV_FILE" "$ENV_FILE.bak_$(date +%Y%m%d_%H%M%S)"

# حذف خط قدیمی
grep -v '^TELEGRAM_BOT_TOKEN=' "$ENV_FILE" > "$ENV_FILE.tmp" || true
mv "$ENV_FILE.tmp" "$ENV_FILE"

# افزودن مقدار جدید
echo "TELEGRAM_BOT_TOKEN=$TOKEN" >> "$ENV_FILE"

echo "✅ TELEGRAM_BOT_TOKEN در .env تنظیم شد."
echo "📁 بکاپ قدیمی: $ENV_FILE.bak_$(date +%Y%m%d_%H%M%S)"
