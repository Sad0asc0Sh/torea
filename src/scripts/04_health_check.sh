#!/usr/bin/env bash
set -e

echo "======================================"
echo "   ToInfinity – HEALTH CHECK"
echo "======================================"
echo

echo "[1] اطلاعات پایه سیستم"
echo "----------------------"
echo "User : $(whoami)"
echo "Host : $(hostname)"
echo "Uptime:"
uptime
echo

echo "[2] فضای دیسک /"
echo "----------------------"
df -h /
echo

echo "[3] وضعیت pm2"
echo "----------------------"
if command -v pm2 >/dev/null 2>&1; then
  pm2 list || echo "❌ خطا در pm2 list"
else
  echo "pm2 نصب نیست."
fi
echo

echo "[4] وضعیت nginx"
echo "----------------------"
if command -v systemctl >/dev/null 2>&1; then
  systemctl status nginx --no-pager -l | sed -n '1,15p' || echo "❌ خطا در systemctl nginx"
else
  echo "systemctl در این سیستم در دسترس نیست."
fi
echo

echo "[5] تست سریع دیتابیس (PostgreSQL)"
echo "----------------------"
cd /opt/bria-app || exit 0
if [ -f .env ]; then
  DATABASE_URL="$(grep '^DATABASE_URL=' .env | sed 's/^DATABASE_URL=//')"
  if [ -n "$DATABASE_URL" ]; then
    if command -v psql >/dev/null 2>&1; then
      echo "تلاش برای اتصال به دیتابیس..."
      psql "$DATABASE_URL" -c "SELECT 1;" || echo "❌ اتصال به دیتابیس ناموفق بود."
    else
      echo "psql نصب نیست؛ نمی‌توان تست دیتابیس انجام داد."
    fi
  else
    echo "DATABASE_URL در فایل .env پیدا نشد."
  fi
else
  echo "فایل .env در /opt/bria-app وجود ندارد."
fi

echo
echo "===== پایان Health Check ====="
