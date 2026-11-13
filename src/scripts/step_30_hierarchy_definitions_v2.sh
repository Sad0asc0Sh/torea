#!/usr/bin/env bash
set -euo pipefail

APP="/opt/bria-app"
cd "$APP"

# load env
if [ -f "$APP/.env" ]; then
  set -a
  source "$APP/.env"
  set +a
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "ERROR: DATABASE_URL is empty. Check /opt/bria-app/.env"
  exit 1
fi

ts="$(date +%F_%H%M%S)"
BK="/opt/bria-backups/$ts"
mkdir -p "$BK"
cp -a "$APP/server.js" "$BK/" 2>/dev/null || true
cp -a "$APP/routes" "$BK/" 2>/dev/null || true
cp -a "$APP/views" "$BK/" 2>/dev/null || true
cp -a "$APP/public" "$BK/" 2>/dev/null || true
echo "Backup: $BK"

echo "== DB: ensure org_nodes =="
psql "$DATABASE_URL" <<'SQL'
DO $$
BEGIN
  CREATE TABLE IF NOT EXISTS org_nodes (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    parent_id BIGINT NULL,
    level INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='org_nodes' AND column_name='title') THEN
    ALTER TABLE org_nodes ADD COLUMN title TEXT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='org_nodes' AND column_name='parent_id') THEN
    ALTER TABLE org_nodes ADD COLUMN parent_id BIGINT;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='org_nodes' AND column_name='level') THEN
    ALTER TABLE org_nodes ADD COLUMN level INT NOT NULL DEFAULT 1;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='org_nodes' AND column_name='created_at') THEN
    ALTER TABLE org_nodes ADD COLUMN created_at TIMESTAMPTZ NOT NULL DEFAULT now();
  END IF;

  BEGIN
    ALTER TABLE org_nodes
      ADD CONSTRAINT org_nodes_parent_fk
      FOREIGN KEY (parent_id) REFERENCES org_nodes(id) ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  CREATE INDEX IF NOT EXISTS idx_org_nodes_parent_id ON org_nodes(parent_id);
END $$;
SQL

echo "== UI: fix admin_definitions.ejs (trim after </html> and add button) =="
DEF="$APP/views/admin_definitions.ejs"
if [ ! -f "$DEF" ]; then
  echo "ERROR: $DEF not found"
  exit 1
fi

# 1) trim anything after </html> (you had extra card appended before)
awk '
  {print}
  /<\/html>/ {exit}
' "$DEF" > "$DEF.tmp" && mv "$DEF.tmp" "$DEF"

# 2) add hierarchy button exactly like other buttons, inside same btn-row
if ! grep -q '/admin/definitions/hierarchy' "$DEF"; then
  sed -i '/تعریف کالاها/ a\
        <a class="btn primary" href="/admin/definitions/hierarchy">تعریف سلسله مراتب (UI خام)</a>' "$DEF"
fi

echo "== UI: write views/admin_hierarchy.ejs =="
cat > "$APP/views/admin_hierarchy.ejs" <<'EJS'
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>تعریف سلسله مراتب | To infinity</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003.0/Vazirmatn-Variable-font-face.css">
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
    }
    .btn.primary{
      border-color:rgba(99,102,241,.8);
      background:rgba(79,70,229,.12);
      color:#c7d2fe;
    }
    .grid{display:grid;grid-template-columns:1fr;gap:.75rem;}
    @media(min-width:900px){ .grid{grid-template-columns:420px 1fr;} }
    label{display:block;font-size:.78rem;margin:.35rem 0;}
    input,select{
      width:100%;
      border-radius:14px;
      border:1px solid rgba(148,163,184,.35);
      background:#0b1020;
      color:#e5e7eb;
      padding:.6rem .75rem;
      font-size:.85rem;
      outline:none;
    }
    .msg{margin-top:.6rem;font-size:.8rem;color:#a5b4fc;}
    .err{margin-top:.6rem;font-size:.8rem;color:#fecaca;}
    table{width:100%;border-collapse:collapse;margin-top:.5rem;}
    th,td{font-size:.78rem;padding:.55rem .5rem;border-bottom:1px solid rgba(148,163,184,.18);text-align:right;}
    th{color:#c7d2fe;font-weight:600;}
    .muted{color:#9ca3af;}
    .indent{white-space:pre;}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="top">
      <div>
        <div class="title">تعریف سلسله مراتب سازمانی</div>
        <div class="sub">ادمین لایه‌ها/سمت‌ها را می‌سازد (تا ۱۰ لایه). هر گره می‌تواند بالادستی داشته باشد.</div>
      </div>
      <div class="back">
        <a href="/admin/definitions">◂ بازگشت به تعاریف</a>
      </div>
    </div>

    <div class="grid">
      <div class="card">
        <h2>افزودن سمت/لایه جدید</h2>
        <p>عنوان را وارد کن و بالادستی را انتخاب کن. اگر دیتابیس خالی باشد، «ادمین» خودکار ریشه می‌شود.</p>

        <form method="post" action="/admin/definitions/hierarchy">
          <label>عنوان سمت/لایه</label>
          <input name="title" placeholder="مثلاً مدیر فروش ارشد" required>

          <label>بالادستی</label>
          <select name="parent_id">
            <option value="">— انتخاب بالادستی —</option>
            <% (nodes || []).forEach(n => { %>
              <option value="<%= n.id %>"><%= ('—'.repeat(Math.max(0,(n.level||1)-1)) + ' ' + (n.title||'')).trim() %></option>
            <% }) %>
          </select>

          <div class="btn-row" style="margin-top:.8rem">
            <button class="btn primary" type="submit">ثبت</button>
            <a class="btn" href="/admin/definitions">انصراف</a>
          </div>

          <% if (message) { %><div class="msg"><%= message %></div><% } %>
          <% if (error) { %><div class="err"><%= error %></div><% } %>
        </form>
      </div>

      <div class="card">
        <h2>لیست لایه‌ها</h2>
        <p class="muted">فعلاً نمایش ساده است؛ بعداً برای تایید زیرمجموعه‌ها استفاده می‌شود.</p>

        <table>
          <thead>
            <tr>
              <th>شناسه</th>
              <th>عنوان</th>
              <th>سطح</th>
              <th>بالادستی</th>
            </tr>
          </thead>
          <tbody>
            <% if (!nodes || nodes.length === 0) { %>
              <tr><td colspan="4" class="muted">هیچ موردی ثبت نشده.</td></tr>
            <% } else { %>
              <% nodes.forEach(n => { %>
                <tr>
                  <td><%= n.id %></td>
                  <td class="indent"><%= ('—'.repeat(Math.max(0,(n.level||1)-1)) + ' ' + (n.title||'')).trim() %></td>
                  <td><%= n.level %></td>
                  <td class="muted"><%= n.parent_title || '—' %></td>
                </tr>
              <% }) %>
            <% } %>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</body>
</html>
EJS

echo "== API: patch routes/admin.js safely (no perl) =="
ADMINJS="$APP/routes/admin.js"
if [ ! -f "$ADMINJS" ]; then
  echo "ERROR: $ADMINJS not found"
  exit 1
fi

if ! grep -q "BRIA_HIERARCHY_ROUTES_BEGIN" "$ADMINJS"; then
  BLOCK="/tmp/bria_hierarchy_routes.block.js"
  cat > "$BLOCK" <<'JS'

// BRIA_HIERARCHY_ROUTES_BEGIN
const { Pool } = require('pg');
const pool = require('./config/db');
const hierarchyPool = pool;

async function ensureRootAdminNode() {
  const c = await hierarchyPool.query('SELECT COUNT(*)::int AS n FROM org_nodes');
  if ((c.rows[0]?.n || 0) === 0) {
    await hierarchyPool.query('INSERT INTO org_nodes(title,parent_id,level) VALUES ($1,NULL,1)', ['ادمین']);
  }
}

async function fetchNodes() {
  const q = await hierarchyPool.query(`
    SELECT n.id, COALESCE(n.title,'') AS title, COALESCE(n.level,1) AS level,
           p.title AS parent_title
    FROM org_nodes n
    LEFT JOIN org_nodes p ON p.id = n.parent_id
    ORDER BY COALESCE(n.level,1), n.id
  `);
  return q.rows || [];
}

router.get('/definitions/hierarchy', async (req, res) => {
  try {
    await ensureRootAdminNode();
    const nodes = await fetchNodes();
    return res.render('admin_hierarchy', { nodes, error: null, message: null });
  } catch (e) {
    console.error('hierarchy GET error:', e);
    return res.status(500).send('خطا در بارگذاری فرم سلسله مراتب');
  }
});

router.post('/definitions/hierarchy', async (req, res) => {
  const title = (req.body.title || '').trim();
  const parent_id_raw = (req.body.parent_id || '').trim();
  const parent_id = parent_id_raw ? Number(parent_id_raw) : null;

  try {
    await ensureRootAdminNode();

    if (!title) {
      const nodes = await fetchNodes();
      return res.render('admin_hierarchy', { nodes, error: 'عنوان را وارد کنید.', message: null });
    }

    let level = 1;
    let realParent = parent_id;

    if (realParent) {
      const p = await hierarchyPool.query('SELECT id, COALESCE(level,1) AS level FROM org_nodes WHERE id=$1', [realParent]);
      if (!p.rows.length) {
        const nodes = await fetchNodes();
        return res.render('admin_hierarchy', { nodes, error: 'بالادستی انتخاب‌شده معتبر نیست.', message: null });
      }
      level = (p.rows[0].level || 1) + 1;
    } else {
      const root = await hierarchyPool.query('SELECT id, COALESCE(level,1) AS level FROM org_nodes ORDER BY COALESCE(level,1), id LIMIT 1');
      realParent = root.rows[0]?.id || null;
      level = (root.rows[0]?.level || 1) + 1;
    }

    if (level > 10) {
      const nodes = await fetchNodes();
      return res.render('admin_hierarchy', { nodes, error: 'حداکثر عمق ۱۰ لایه است.', message: null });
    }

    await hierarchyPool.query(
      'INSERT INTO org_nodes(title,parent_id,level) VALUES ($1,$2,$3)',
      [title, realParent, level]
    );

    const nodes = await fetchNodes();
    return res.render('admin_hierarchy', { nodes, error: null, message: 'با موفقیت ثبت شد.' });
  } catch (e) {
    console.error('hierarchy POST error:', e);
    const nodes = await fetchNodes().catch(()=>[]);
    return res.render('admin_hierarchy', { nodes, error: 'خطا در ذخیره‌سازی. دوباره تلاش کنید.', message: null });
  }
});
// BRIA_HIERARCHY_ROUTES_END

JS

  # insert block before module.exports
  awk '
    FNR==NR {b=b $0 ORS; next}
    !added && $0 ~ /module\.exports[[:space:]]*=[[:space:]]*router/ {printf "%s", b; added=1}
    {print}
  ' "$BLOCK" "$ADMINJS" > "$ADMINJS.tmp" && mv "$ADMINJS.tmp" "$ADMINJS"
else
  echo "Hierarchy routes already exist in admin.js"
fi

echo "== Restart pm2 =="
pm2 restart bria-app
echo "OK. Go to /admin/definitions and click hierarchy button."
