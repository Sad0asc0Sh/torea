#!/bin/bash

SCRIPTS_DIR="/opt/bria-app/scripts"

while true; do
  clear
  echo "==============================="
  echo "     اسکریپت‌های دیتابیس"
  echo "==============================="
  echo
  echo " 1) users table  (ثبت‌نام / کاربران)"
  echo " 2) hierarchy table (سلسله‌مراتب بالا/زیر دست)"
  echo " 0) بازگشت به منوی اصلی"
  echo
  read -p "گزینه را انتخاب کن: " CH

  case "$CH" in
    1)
      bash "$SCRIPTS_DIR/db_users_table.sh"
      ;;
    2)
      bash "$SCRIPTS_DIR/db_hierarchy_table.sh"
      ;;
    0)
      break
      ;;
    *)
      echo "گزینه نامعتبر."
      sleep 1
      ;;
  esac
done
