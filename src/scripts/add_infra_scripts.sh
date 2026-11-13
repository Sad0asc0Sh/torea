#!/usr/bin/env bash
set -e

DIR="/opt/bria-app/scripts"

echo "======================================="
echo "  add_infra_scripts.sh"
echo "======================================="
echo "این اسکریپت به ترتیب اسکریپت‌های زیر را اجرا می‌کند:"
echo "  1) 01_nginx_domain_alamis.sh"
echo "  2) 02_setup_telegram_env.sh"
echo

read -p "ادامه بدهم؟ (y/N) " ANS
case "$ANS" in
  y|Y)
    bash "$DIR/01_nginx_domain_alamis.sh"
    bash "$DIR/02_setup_telegram_env.sh"
    echo "✅ تنظیمات زیرساخت انجام شد."
    ;;
  *)
    echo "⏹ لغو شد."
    ;;
esac
