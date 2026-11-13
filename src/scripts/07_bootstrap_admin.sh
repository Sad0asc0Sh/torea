#!/usr/bin/env bash
set -e

APP_DIR="/opt/bria-app"
cd "$APP_DIR" || exit 1

if [ ! -f .env ]; then
  echo ".env not found"
  exit 1
fi

DB_URL=$(grep -E "^DATABASE_URL=" .env | sed "s/^DATABASE_URL=//")
if [ -z "$DB_URL" ]; then
  echo "DATABASE_URL missing in .env"
  exit 1
fi

echo "== Activating admin user =="

psql "$DB_URL" << "SQL"
DO $$
DECLARE
  exists_admin BOOLEAN;
BEGIN
  SELECT EXISTS (SELECT 1 FROM users WHERE username=admin)
  INTO exists_admin;

  IF exists_admin THEN
    UPDATE users
    SET is_active = TRUE,
        telegram_verified = TRUE,
        is_approved = TRUE
    WHERE username=admin;

    RAISE NOTICE Admin
