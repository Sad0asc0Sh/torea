#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/bria-app"
VIEWS_DIR="$APP_DIR/views"
ROUTES_FILE="$APP_DIR/routes/admin.js"
DEFS_VIEW="$VIEWS_DIR/admin_definitions.ejs"

TS="$(date +%F_%H%M%S)"
BK="/opt/bria-backups/$TS"
mkdir -p "$BK"

echo "==> Backup to: $BK"
cp -a "$ROUTES_FILE" "$BK/admin.js.bak"
cp -a "$DEFS_VIEW" "$BK/admin_definitions.ejs.bak"
cp -a "$VIEWS_DIR" "$BK/views.bak" 2>/dev/null || true

echo "==> 1) Update buttons in admin_definitions.ejs to links"
perl -0777 -i -pe '
  s#<button\s+class="btn\s+primary"\s+type="button">\s*تعریف\s+سبدها\s+\(UI\s+خام\)\s*</button>#<a class="btn primary" href="/admin/definitions/baskets">تعریف سبدها (UI خام)</a>#g;
  s#<button\s+class="btn\s+primary"\s+type="button">\s*تعریف\s+برندها\s+\(UI\s+خام\)\s*</button>#<a class="btn primary" href="/admin/definitions/brands">تعریف برندها (UI خام)</a>#g;
  s#<button\s+class="btn\s+primary"\s+type="button">\s*تعریف\s+کالاها\s+\(UI\s+خام\)\s*</button>#<a class="btn primary" href="/admin/definitions/products">تعریف کالاها (UI خام)</a>#g;
' "$DEFS_VIEW"

echo "==> 2) Create raw views (baskets/brands/products)"
mkdir -p "$VIEWS_DIR"

create_view () {
  local file="$1"
  local title="$2"
  local back="/admin/definitions"
  cat > "$file" <<EOF
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>${title} | To infinity</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003.0/Vazirmatn-Variable-font-face.css">
  <style>
    body{margin:0;background:#020617;color:#e5e7eb;font-family:"Vazirmatn",system-ui;}
    .wrap{max-width:950px;margin:0 auto;padding:1.2rem;}
    .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.1rem;}
    .title{font-size:1rem;margin-bottom:.25rem;}
    .sub{font-size:.8rem;color:#9ca3af;}
    .back a{font-size:.8rem;color:#a5b4fc;text-decoration:none;}
    .card{
      border-radius:18px;
      background:#020617;
      border:1px solid rgba(148,163,184,.3);
      padding:1rem .9rem;
      margin-bottom:.9rem;
    }
    .card h2{font-size:.95rem;margin-bottom:.35rem;}
    .card p{font-size:.8rem;color:#9ca3af;margin-bottom:.6rem;}
    .btn-row{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:.5rem;}
    .btn{
      padding:.45rem .8rem;
      border-radius:999px;
      border:1px solid rgba(148,163,184,.45);
      background:#020617;
      color:#e5e7eb;
      font-size:.78rem;
      text-decoration:none;
      cursor:pointer;
      display:inline-block;
    }
    .btn.primary{
      border-color:rgba(99,102,241,.8);
      background:rgba(79,70,229,.12);
      color:#c7d2fe;
    }
    .pill{
      display:inline-block;
      border-radius:999px;
      padding:.25rem .65rem;
      font-size:.72rem;
      border:1px solid rgba(148,163,184,.35);
      color:#cbd5e1;
      background:rgba(15,23,42,.55);
    }
    .ok{border-color:rgba(34,197,94,.5);color:#bbf7d0;background:rgba(34,197,94,.08);}
    .bad{border-color:rgba(248,113,113,.55);color:#fecaca;background:rgba(248,113,113,.08);}
    .mono{font-family:ui-monospace,SFMono-Regular,Menlo,Monaco,Consolas,"Liberation Mono","Courier New",monospace;font-size:.75rem;color:#9ca3af;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">${title}</div>
        <div class="sub">این فرم فعلاً خام است و فقط برای تست مسیر و تست اتصال دیتابیس ساخته شده.</div>
      </div>
      <div class="back">
        <a href="${back}">◂ بازگشت به تعاریف</a>
      </div>
    </div>

    <div class="card">
      <h2>وضعیت اتصال</h2>
      <p>در همین صفحه یک Query ساده به دیتابیس زده می‌شود (SELECT 1) تا مطمئن شویم اتصال OK است.</p>

      <% if (dbOk) { %>
        <span class="pill ok">✅ اتصال دیتابیس OK</span>
      <% } else { %>
        <span class="pill bad">⛔ اتصال دیتابیس مشکل دارد</span>
        <% if (dbError) { %>
          <div style="margin-top:.6rem" class="mono"><%= dbError %></div>
        <% } %>
      <% } %>

      <div class="btn-row" style="margin-top:.9rem">
        <a class="btn primary" href="${back}">بازگشت</a>
      </div>
    </div>

    <div class="card">
      <h2>فرم خام</h2>
      <p>مرحله بعدی: فیلدهای واقعی و CRUD کامل همین‌جا اضافه می‌شود.</p>
      <div class="mono">مسیر فعلی: <%= routePath %></div>
    </div>
  </div>
</body>
</html>
EOF
}

create_view "$VIEWS_DIR/admin_def_baskets.ejs" "تعریف سبدها"
create_view "$VIEWS_DIR/admin_def_brands.ejs" "تعریف برندها"
create_view "$VIEWS_DIR/admin_def_products.ejs" "تعریف کالاها"

echo "==> 3) Add routes to routes/admin.js (before module.exports)"
# اگر قبلاً اضافه شده، دوباره اضافه نکن
if grep -q "BRIA_RAW_DEFS_BEGIN" "$ROUTES_FILE"; then
  echo "Routes block already exists. Skipping route insert."
else
  perl -0777 -i -pe '
    s#\n\s*module\.exports\s*=\s*router\s*;\s*\n#\n\n// BRIA_RAW_DEFS_BEGIN\n\
router.get(\"/definitions/baskets\", async (req, res) => {\n\
  let dbOk = false; let dbError = null;\n\
  try {\n\
    if (typeof pool !== \"undefined\" && pool && pool.query) {\n\
      await pool.query(\"SELECT 1\");\n\
      dbOk = true;\n\
    } else {\n\
      dbError = \"pool is not available\";\n\
    }\n\
  } catch (e) { dbError = (e && e.message) ? e.message : String(e); }\n\
  return res.render(\"admin_def_baskets\", { dbOk, dbError, routePath: \"/admin/definitions/baskets\" });\n\
});\n\
\n\
router.get(\"/definitions/brands\", async (req, res) => {\n\
  let dbOk = false; let dbError = null;\n\
  try {\n\
    if (typeof pool !== \"undefined\" && pool && pool.query) {\n\
      await pool.query(\"SELECT 1\");\n\
      dbOk = true;\n\
    } else {\n\
      dbError = \"pool is not available\";\n\
    }\n\
  } catch (e) { dbError = (e && e.message) ? e.message : String(e); }\n\
  return res.render(\"admin_def_brands\", { dbOk, dbError, routePath: \"/admin/definitions/brands\" });\n\
});\n\
\n\
router.get(\"/definitions/products\", async (req, res) => {\n\
  let dbOk = false; let dbError = null;\n\
  try {\n\
    if (typeof pool !== \"undefined\" && pool && pool.query) {\n\
      await pool.query(\"SELECT 1\");\n\
      dbOk = true;\n\
    } else {\n\
      dbError = \"pool is not available\";\n\
    }\n\
  } catch (e) { dbError = (e && e.message) ? e.message : String(e); }\n\
  return res.render(\"admin_def_products\", { dbOk, dbError, routePath: \"/admin/definitions/products\" });\n\
});\n\
// BRIA_RAW_DEFS_END\n\
\nmodule.exports = router;\n#s#g;
  ' "$ROUTES_FILE"
fi

echo "==> 4) Restart pm2"
pm2 restart bria-app >/dev/null

echo "==> Done ✅"
echo "Test these URLs:"
echo "  /admin/definitions/baskets"
echo "  /admin/definitions/brands"
echo "  /admin/definitions/products"
