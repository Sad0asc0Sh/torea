#!/usr/bin/env bash
set -euo pipefail

APP="/opt/bria-app"
cd "$APP"

# ---------------- backup ----------------
ts="$(date +%F_%H%M%S)"
BK="/opt/bria-backups/$ts"
mkdir -p "$BK"
cp -a "$APP/server.js" "$APP/routes" "$APP/views" "$BK/" 2>/dev/null || true
echo "[OK] Backup: $BK"

# ---------------- load .env for DATABASE_URL ----------------
if [ -f "$APP/.env" ]; then
  set -a
  . "$APP/.env" || true
  set +a
fi

# ---------------- 1) Fix admin_definitions.ejs (move hierarchy card inside page + correct button class) ----------------
DEF="$APP/views/admin_definitions.ejs"

if [ -f "$DEF" ]; then
  # 1-1) remove anything after </html> (your extra card is outside html)
  perl -0777 -i -pe 's#</html>[\s\S]*$#</html>\n#s' "$DEF"

  # 1-2) inject hierarchy card before closing wrap </div> ... </body>
  perl -0777 -i -pe '
    my $block = qq{
      <div class="card">
        <h2>تعریف سلسله مراتب سازمانی</h2>
        <p>این بخش برای ساخت لایه‌ها/سمت‌ها است تا هر مدیر بتواند زیرمجموعه‌های خودش را تأیید کند (تا ۱۰ لایه).</p>
        <div class="btn-row">
          <a class="btn primary" href="/admin/definitions/hierarchy">تعریف سلسله مراتب</a>
        </div>
      </div>
    };

    s#(\n\s*</div>\s*\n\s*</body>)#\n$block$1#s;
  ' "$DEF"

  echo "[OK] admin_definitions.ejs fixed"
else
  echo "[WARN] $DEF not found"
fi

# ---------------- 2) Create view admin_hierarchy.ejs (same UI style as definitions) ----------------
cat > "$APP/views/admin_hierarchy.ejs" <<'EJS'
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8">
  <title>سلسله مراتب | To infinity</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <link rel="stylesheet"
        href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003.0/Vazirmatn-Variable-font-face.css">
  <style>
    body{margin:0;background:#020617;color:#e5e7eb;font-family:"Vazirmatn",system-ui;}
    .wrap{max-width:950px;margin:0 auto;padding:1.2rem;}
    .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.1rem;gap:10px;}
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
    }
    .btn.primary{
      border-color:rgba(99,102,241,.8);
      background:rgba(79,70,229,.12);
      color:#c7d2fe;
    }
    .field{margin-top:.7rem;}
    label{display:block;font-size:.78rem;margin-bottom:.35rem;color:#cbd5e1;}
    input,select{
      width:100%;
      padding:.55rem .75rem;
      border-radius:14px;
      border:1px solid rgba(148,163,184,.35);
      background:#0b1020;
      color:#e5e7eb;
      outline:none;
      font-family:"Vazirmatn",system-ui;
      font-size:.85rem;
    }
    .hint{font-size:.75rem;color:#9ca3af;margin-top:.35rem;}
    .alert{border-radius:14px;padding:.6rem .75rem;font-size:.8rem;margin:.6rem 0;}
    .alert.ok{border:1px solid rgba(34,197,94,.45); background:rgba(34,197,94,.08); color:#bbf7d0;}
    .alert.err{border:1px solid rgba(248,113,113,.55); background:rgba(248,113,113,.08); color:#fecaca;}
    table{width:100%;border-collapse:collapse;margin-top:.6rem;font-size:.82rem;}
    th,td{padding:.55rem .5rem;border-bottom:1px solid rgba(148,163,184,.2);text-align:right;}
    th{color:#cbd5e1;font-weight:600;}
    td{color:#e5e7eb;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">تعریف سلسله مراتب سازمانی</div>
        <div class="sub">ادمین لایه‌ها/سمت‌ها را می‌سازد و برای هر مورد، بالادستی مشخص می‌شود (تا ۱۰ لایه).</div>
      </div>
      <div class="back">
        <a href="/admin/definitions">◂ بازگشت به تعاریف</a>
      </div>
    </div>

    <div class="card">
      <h2>ثبت لایه/سمت جدید</h2>

      <% if (typeof error !== 'undefined' && error) { %>
        <div class="alert err"><%= error %></div>
      <% } %>
      <% if (typeof success !== 'undefined' && success) { %>
        <div class="alert ok"><%= success %></div>
      <% } %>

      <form method="post" action="/admin/definitions/hierarchy">
        <div class="field">
          <label>عنوان</label>
          <input name="title" placeholder="مثلاً مدیر فروش ارشد" required>
        </div>

        <div class="field">
          <label>بالادستی</label>
          <select name="parent_id">
            <option value="">(بدون بالادستی) — ریشه</option>
            <% (options || []).forEach(o => { %>
              <option value="<%= o.id %>"><%= o.label %></option>
            <% }) %>
          </select>
          <div class="hint">بالادستی را از لیست انتخاب کن (بر اساس مواردی که تا الان تعریف شده).</div>
        </div>

        <div class="btn-row">
          <button class="btn primary" type="submit">ثبت</button>
          <a class="btn" href="/admin/definitions">بازگشت</a>
        </div>
      </form>
    </div>

    <div class="card">
      <h2>لیست فعلی</h2>
      <p>نمایش ساختار فعلی (برای کنترل ادمین).</p>
      <table>
        <thead>
          <tr>
            <th>شناسه</th>
            <th>عنوان</th>
            <th>بالادستی</th>
            <th>عمق</th>
          </tr>
        </thead>
        <tbody>
          <% (rows || []).forEach(r => { %>
            <tr>
              <td><%= r.id %></td>
              <td><%= r.title %></td>
              <td><%= r.parent_title || '—' %></td>
              <td><%= r.depth %></td>
            </tr>
          <% }) %>
        </tbody>
      </table>
    </div>

  </div>
</body>
</html>
EJS
echo "[OK] views/admin_hierarchy.ejs created/updated"

# ---------------- 3) Add DB table (only if DATABASE_URL exists) ----------------
if [ -n "${DATABASE_URL:-}" ]; then
  echo "[OK] DATABASE_URL found -> creating table org_hierarchy (safe)"
  psql "$DATABASE_URL" <<'SQL'
CREATE TABLE IF NOT EXISTS org_hierarchy (
  id         SERIAL PRIMARY KEY,
  title      TEXT NOT NULL,
  parent_id  INT NULL REFERENCES org_hierarchy(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_org_hierarchy_parent ON org_hierarchy(parent_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM org_hierarchy) THEN
    INSERT INTO org_hierarchy(title, parent_id) VALUES ('ادمین', NULL);
  END IF;
END $$;
SQL
else
  echo "[WARN] DATABASE_URL not available in shell -> DB step skipped (UI still works)."
fi

# ---------------- 4) Patch routes/admin.js to add GET/POST handlers (idempotent) ----------------
ADMINJS="$APP/routes/admin.js"
if [ ! -f "$ADMINJS" ]; then
  echo "[ERR] $ADMINJS not found. Your /admin routes may be in a different file."
  exit 1
fi

if grep -q "BRIA_HIERARCHY_ROUTES_BEGIN" "$ADMINJS"; then
  echo "[OK] hierarchy routes already exist in routes/admin.js"
else
  tmp="$(mktemp)"

  awk '
    BEGIN{added=0}
    {
      if (!added && $0 ~ /module\.exports\s*=\s*router/){
        print ""
        print "// BRIA_HIERARCHY_ROUTES_BEGIN"
        print "const { Pool } = require(\"pg\");"
        print "let __briaPool = null;"
        print "function briaPool(){"
        print "  if (__briaPool) return __briaPool;"
        print "  __briaPool = new Pool({ connectionString: process.env.DATABASE_URL });"
        print "  return __briaPool;"
        print "}"
        print ""
        print "router.get(\"/definitions/hierarchy\", async (req, res) => {"
        print "  try {"
        print "    let options = [], rows = [];"
        print "    if (process.env.DATABASE_URL) {"
        print "      const pool = briaPool();"
        print "      const treeSql = `"
        print "        WITH RECURSIVE t AS ("
        print "          SELECT id, title, parent_id, 1 AS depth, title::text AS path"
        print "          FROM org_hierarchy"
        print "          WHERE parent_id IS NULL"
        print "          UNION ALL"
        print "          SELECT c.id, c.title, c.parent_id, t.depth + 1, (t.path || ' / ' || c.title)"
        print "          FROM org_hierarchy c"
        print "          JOIN t ON c.parent_id = t.id"
        print "        )"
        print "        SELECT id, title, parent_id, depth, path FROM t ORDER BY path;"
        print "      `;"
        print "      const t = await pool.query(treeSql);"
        print "      options = t.rows.map(r => ({ id: r.id, label: (\"— \".repeat(Math.max(0, r.depth-1)) + r.title) }));"
        print ""
        print "      const listSql = `"
        print "        WITH RECURSIVE t AS ("
        print "          SELECT id, title, parent_id, 1 AS depth, title::text AS path"
        print "          FROM org_hierarchy"
        print "          WHERE parent_id IS NULL"
        print "          UNION ALL"
        print "          SELECT c.id, c.title, c.parent_id, t.depth + 1, (t.path || ' / ' || c.title)"
        print "          FROM org_hierarchy c"
        print "          JOIN t ON c.parent_id = t.id"
        print "        )"
        print "        SELECT t.id, t.title, t.parent_id, t.depth, p.title AS parent_title"
        print "        FROM t"
        print "        LEFT JOIN org_hierarchy p ON p.id = t.parent_id"
        print "        ORDER BY t.path;"
        print "      `;"
        print "      rows = (await pool.query(listSql)).rows;"
        print "    }"
        print ""
        print "    res.render(\"admin_hierarchy\", {"
        print "      options, rows,"
        print "      error: null,"
        print "      success: null"
        print "    });"
        print "  } catch (e) {"
        print "    console.error(\"hierarchy GET error:\", e);"
        print "    res.render(\"admin_hierarchy\", { options: [], rows: [], error: \"خطا در بارگذاری صفحه سلسله‌مراتب\", success: null });"
        print "  }"
        print "});"
        print ""
        print "router.post(\"/definitions/hierarchy\", async (req, res) => {"
        print "  try {"
        print "    const title = (req.body.title || \"\").trim();"
        print "    const parentRaw = (req.body.parent_id || \"\").trim();"
        print "    const parent_id = parentRaw ? Number(parentRaw) : null;"
        print "    if (!title) return res.redirect(\"/admin/definitions/hierarchy\");"
        print ""
        print "    if (!process.env.DATABASE_URL) {"
        print "      return res.render(\"admin_hierarchy\", { options: [], rows: [], error: \"DATABASE_URL تنظیم نیست. فعلاً فقط UI داریم.\", success: null });"
        print "    }"
        print ""
        print "    const pool = briaPool();"
        print ""
        print "    // depth limit <= 10"
        print "    if (parent_id) {"
        print "      const depthQ = await pool.query(`"
        print "        WITH RECURSIVE up AS ("
        print "          SELECT id, parent_id, 1 AS d FROM org_hierarchy WHERE id = $1"
        print "          UNION ALL"
        print "          SELECT p.id, p.parent_id, up.d + 1"
        print "          FROM org_hierarchy p JOIN up ON up.parent_id = p.id"
        print "        )"
        print "        SELECT MAX(d) AS d FROM up;"
        print "      `, [parent_id]);"
        print "      const pd = Number(depthQ.rows[0]?.d || 1);"
        print "      if (pd >= 10) return res.status(400).send(\"بیش از ۱۰ لایه مجاز نیست\");"
        print "    }"
        print ""
        print "    await pool.query(\"INSERT INTO org_hierarchy(title, parent_id) VALUES ($1,$2)\", [title, parent_id]);"
        print "    res.redirect(\"/admin/definitions/hierarchy\");"
        print "  } catch (e) {"
        print "    console.error(\"hierarchy POST error:\", e);"
        print "    res.render(\"admin_hierarchy\", { options: [], rows: [], error: \"خطا در ثبت سلسله‌مراتب\", success: null });"
        print "  }"
        print "});"
        print "// BRIA_HIERARCHY_ROUTES_END"
        print ""
        added=1
      }
      print
    }
  ' "$ADMINJS" > "$tmp"

  mv "$tmp" "$ADMINJS"
  echo "[OK] routes/admin.js patched with hierarchy routes"
fi

# ---------------- 5) Restart app ----------------
pm2 restart bria-app
echo "[DONE] Open /admin/definitions and click \"تعریف سلسله مراتب\""
