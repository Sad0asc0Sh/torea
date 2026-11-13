#!/bin/bash
set -e

APP_DIR="/opt/bria-app"
cd "$APP_DIR"

echo "----------------------------------------"
echo "  اسکریپت دیتابیس: hierarchy table"
echo "----------------------------------------"

if [ ! -f .env ]; then
  echo ".env پیدا نشد در: $APP_DIR"
  exit 1
fi

DB_URL=$(grep -E '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//')

if [ -z "$DB_URL" ]; then
  echo "متغیر DATABASE_URL داخل .env تنظیم نشده."
  exit 1
fi

echo
echo "اتصال تستی به دیتابیس..."
echo

psql "$DB_URL" -c "SELECT current_database(), current_user;" || {
  echo "اتصال به دیتابیس ناموفق بود."
  exit 1
}

echo
echo "✅ اتصال برقرار است."
echo "----------------------------------------"
echo "اینجا می‌تونی دستورات ساخت/آپدیت جدول hierarchy را بذاری."
echo "مثال (فقط نمونه – فعلاً اجرا نمی‌شود):"
cat <<'SQL_SAMPLE'
-- CREATE TABLE IF NOT EXISTS hierarchy (
--   id SERIAL PRIMARY KEY,
--   user_id INTEGER NOT NULL REFERENCES users(id),
--   manager_id INTEGER REFERENCES users(id),
--   created_at TIMESTAMP DEFAULT NOW()
-- );
SQL_SAMPLE
echo "----------------------------------------"
echo "فعلاً این اسکریپت فقط تست اتصال می‌کند و چیزی را تغییر نمی‌دهد."
