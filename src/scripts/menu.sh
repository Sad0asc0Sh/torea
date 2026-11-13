#!/usr/bin/env bash
set -e

SCRIPTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

while true; do
  clear
  echo "======================================"
  echo "   ToInfinity – BRIA Admin Tools"
  echo "======================================"
  echo
  echo "1) آپدیت UI لاگین و پنل ادمین"
  echo "2) اعمال برندینگ و آیکون‌ها (لوگو + icons)"
  echo "3) تنظیم / تغییر تنظیمات تلگرام (.env)"
  echo "4) آپدیت منطق ثبت‌نام + تلگرام"
  echo "5) تنظیم Nginx و دامنه alamis.info"
  echo "6) Health Check (وضعیت سرویس‌ها و دیتابیس)"
  echo "7) ری‌استارت سرویس‌ها (pm2 + nginx)"
  echo "0) خروج"
  echo
  read -p "شماره گزینه را وارد کن: " CH
  echo

  case "$CH" in
    1)
      bash "$SCRIPTS_DIR/update_views.sh"
      echo
      read -p "پایان گزینه 1 - Enter بزن..." _
      ;;
    2)
      bash "$SCRIPTS_DIR/03_apply_branding.sh"
      echo
      read -p "پایان گزینه 2 - Enter بزن..." _
      ;;
    3)
      bash "$SCRIPTS_DIR/02_setup_telegram_env.sh"
      echo
      read -p "پایان گزینه 3 - Enter بزن..." _
      ;;
    4)
      bash "$SCRIPTS_DIR/update_register_telegram.sh"
      echo
      read -p "پایان گزینه 4 - Enter بزن..." _
      ;;
    5)
      bash "$SCRIPTS_DIR/01_nginx_domain_alamis.sh"
      echo
      read -p "پایان گزینه 5 - Enter بزن..." _
      ;;
    6)
      bash "$SCRIPTS_DIR/04_health_check.sh"
      echo
      read -p "پایان گزینه 6 - Enter بزن..." _
      ;;
    7)
      bash "$SCRIPTS_DIR/05_restart_services.sh"
      echo
      read -p "پایان گزینه 7 - Enter بزن..." _
      ;;
    0)
      echo "خروج از ابزار ToInfinity..."
      exit 0
      ;;
    *)
      echo "گزینه نامعتبر؛ دوباره تلاش کن."
      sleep 1
      ;;
  esac
done
