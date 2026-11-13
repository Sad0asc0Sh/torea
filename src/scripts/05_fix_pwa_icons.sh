#!/bin/bash

APP_DIR="/opt/bria-app"
PUBLIC_DIR="$APP_DIR/public"
ICONS_DIR="$PUBLIC_DIR/icons"

echo "== بررسی پوشه آیکون‌ها =="
if [[ ! -d "$ICONS_DIR" ]]; then
  echo "پوشه icons یافت نشد: $ICONS_DIR"
  exit 1
fi

echo "== ساخت favicon و apple-touch =="
cp "$ICONS_DIR/icon_180.png" "$PUBLIC_DIR/apple-touch-icon.png"
cp "$ICONS_DIR/icon_32.png"  "$PUBLIC_DIR/favicon-32x32.png"
cp "$ICONS_DIR/icon_32.png"  "$PUBLIC_DIR/favicon.png"
cp "$ICONS_DIR/icon_32.png"  "$PUBLIC_DIR/favicon.ico"

echo "== ساخت manifest.json =="
cat <<MANIFEST > "$PUBLIC_DIR/manifest.json"
{
  "name": "ToInfinity – BRIA",
  "short_name": "ToInfinity",
  "icons": [
    { "src": "/icons/icon_512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "/icons/icon_192.png", "sizes": "192x192", "type": "image/png" }
  ],
  "start_url": "/login",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000"
}
MANIFEST

echo "== تزریق لینک آیکن‌ها در فایل‌های EJS =="

BLOCK='
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">
<link rel="manifest" href="/manifest.json">
'

FILES=$(find "$APP_DIR/views" -maxdepth 2 -name "*.ejs")

for f in $FILES; do
  if ! grep -q "apple-touch-icon" "$f"; then
    echo "✓ اضافه کردن لینک‌ها به: $f"
    # تزریق بعد از تگ <head>
    sed -i "/<head>/a $BLOCK" "$f"
  else
    echo "… قبلاً موجود بود: $f"
  fi
done

echo "== انجام شد =="
