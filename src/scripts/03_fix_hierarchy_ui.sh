#!/usr/bin/env bash
set -euo pipefail
APP="/opt/bria-app"
cd "$APP"

ts="$(date +%F_%H%M%S)"
BKP="/opt/bria-backups/$ts"
mkdir -p "$BKP"
cp -a views/admin_hierarchy.ejs "$BKP/" 2>/dev/null || true
echo "Backup: $BKP/admin_hierarchy.ejs"

FILE="$APP/views/admin_hierarchy.ejs"
if [ ! -f "$FILE" ]; then
  echo "ERROR: $FILE not found"
  exit 1
fi

# 1) اضافه کردن box-sizing برای همه عناصر
# 2) اصلاح input/select: display:block + max-width:100% + min-height + line-height
# 3) اصلاح کارت: padding بیشتر و overflow hidden
perl -0777 -i -pe '
  # add universal box-sizing after body rule (if not exists)
  if ($_ !~ /\*\s*\{[^}]*box-sizing\s*:\s*border-box/s) {
    $_ =~ s/body\{([^}]*)\}/body{$1}\n    *{box-sizing:border-box;}\n/s;
  }

  # make .card safer
  $_ =~ s/\.card\{\n(\s*[^}]*?)padding:\s*1rem\s*\.9rem;/\.card{\n$1padding:1.15rem 1rem;/s;
  if ($_ !~ /\.card\{[^}]*overflow:/s) {
    $_ =~ s/\.card\{([^}]*)\}/.card{$1  overflow:hidden;\n    }/s;
  }

  # input/select styling
  $_ =~ s/input,select\{\n([\s\S]*?)\}/input,select{\n$1  display:block;\n  max-width:100%;\n  min-height:44px;\n  line-height:1.2;\n}\n/s;

  # ensure col min width not too big on mobile (prevent overflow)
  $_ =~ s/\.col\{flex:1;min-width:220px;\}/.col{flex:1;min-width:200px;}\n    @media(max-width:520px){.col{min-width:100%;}}/s;

  # a bit more gap safety
  $_ =~ s/\.row\{display:flex;flex-wrap:wrap;gap:\.6rem;\}/.row{display:flex;flex-wrap:wrap;gap:.75rem;}/s;

' "$FILE"

echo "OK: UI patched."

pm2 restart bria-app >/dev/null
echo "Restarted bria-app."
