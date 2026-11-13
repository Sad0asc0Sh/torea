#!/usr/bin/env bash
set -e

APP_DIR="/opt/bria-app"
PUB="$APP_DIR/public"
ICONS="$PUB/icons"
VIEWS="$APP_DIR/views"

echo "==> Applying ToInfinity branding..."

mkdir -p "$PUB" "$ICONS"

#########################################
# 1) manifest.json دقیقا با همین آیکون‌ها
#########################################
cat << MAN > "$PUB/manifest.json"
{
  "name": "ToInfinity",
  "short_name": "ToInfinity",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#000000",
  "theme_color": "#000000",
  "icons": [
    { "src": "/icons/icon_32.png",   "sizes": "32x32",    "type": "image/png" },
    { "src": "/icons/icon_167.png",  "sizes": "167x167",  "type": "image/png" },
    { "src": "/icons/icon_180.png",  "sizes": "180x180",  "type": "image/png" },
    { "src": "/icons/icon_192.png",  "sizes": "192x192",  "type": "image/png" },
    { "src": "/icons/icon_256.png",  "sizes": "256x256",  "type": "image/png" },
    { "src": "/icons/icon_512.png",  "sizes": "512x512",  "type": "image/png" },
    { "src": "/icons/icon_1024.png", "sizes": "1024x1024","type": "image/png" }
  ]
}
MAN

echo "✓ manifest.json با آیکون‌های واقعی شما تنظیم شد (بدون کشیده شدن تصویر)"

#########################################
# 2) قرار دادن لوگو در فرم لاگین (logo.png)
#########################################
LOGIN="$VIEWS/login.ejs"

if [ -f "$LOGIN" ]; then
  # اگر قبلاً اضافه نشده، یک‌بار لوگو را بالای فرم می‌گذاریم
  if ! grep -q "/icons/logo.png" "$LOGIN"; then
    # یک div ساده‌ی لوگو بعد از <body> یا ابتدای فایل
    sed -i '0,/<body[^>]*>/s//&\n  <div style="text-align:center;margin:20px 0;"><img src="\\/icons\\/logo.png" style="width:120px;height:auto;"></div>/' "$LOGIN" || true
  fi
  echo "✓ login.ejs با لوگوی ToInfinity به‌روزرسانی شد"
else
  echo "⚠ login.ejs پیدا نشد، از این مرحله گذشتیم"
fi

#########################################
# 3) افزودن تگ‌های PWA به همه‌ی viewهای اصلی
#########################################
for FILE in "$VIEWS"/*.ejs; do
  [ -f "$FILE" ] || continue

  if ! grep -q "manifest.json" "$FILE"; then
    sed -i '1i <link rel="manifest" href="/manifest.json">' "$FILE"
  fi

  if ! grep -q "theme-color" "$FILE"; then
    sed -i '1i <meta name="theme-color" content="#000000">' "$FILE"
  fi
done

echo "✓ تگ‌های PWA (manifest + theme-color) به viewها اضافه شد"

echo "---------------------------------------------"
echo "برندینگ ToInfinity با آیکون‌ها و لوگوی فعلی اعمال شد."
echo "هیچ آیکونی resize یا کشیده نشده است."
echo "---------------------------------------------"
