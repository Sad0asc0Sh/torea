#!/usr/bin/env bash
set -euo pipefail

APP="/opt/bria-app"
cd "$APP"

# --- load env (DATABASE_URL) ---
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
echo "Backup created at: $BK"

# --- 1) Ensure DB table/columns exist (safe) ---
echo "== DB: ensure org_nodes columns =="
psql "$DATABASE_URL" <<'SQL'
DO $$
BEGIN
  -- table exists in your DB, but we make it safe anyway:
  CREATE TABLE IF NOT EXISTS org_nodes (
    id BIGSERIAL PRIMARY KEY,
    title TEXT NOT NULL,
    parent_id BIGINT NULL,
    level INT NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
  );

  -- add missing columns safely (if table already existed with different schema)
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

  -- add FK if not exists (best-effort)
  BEGIN
    ALTER TABLE org_nodes
      ADD CONSTRAINT org_nodes_parent_fk FOREIGN KEY (parent_id) REFERENCES org_nodes(id) ON DELETE RESTRICT;
  EXCEPTION WHEN duplicate_object THEN
    NULL;
  END;

  CREATE INDEX IF NOT EXISTS idx_org_nodes_parent_id ON org_nodes(parent_id);
END $$;
SQL

# --- 2) Fix admin_definitions.ejs: add button inside same btn-row like others ---
echo "== UI: patch views/admin_definitions.ejs =="
DEF="$APP/views/admin_definitions.ejs"
if [ -f "$DEF" ]; then
  # remove any old duplicated hierarchy card blocks (best-effort)
  perl -0777 -i -pe 's/\n\s*<div class="card">\s*<h2>تعریف سلسله مراتب سازمانی[\s\S]*?<\/div>\s*\n/\n/g' "$DEF" || true

  # add the button once inside the first btn-row
  if ! grep -q '/admin/definitions/hierarchy' "$DEF"; then
    perl -0777 -i -pe 's/(<div class="btn-row">\s*[\s\S]*?تعریف کالاها \(UI خام\)<\/button>\s*)/\1\n        <a class="btn primary" href="\/admin\/definitions\/hierarchy">تعریف سلسله مراتب (UI خام)<\/a>\n/s' "$DEF"
  fi
else
  echo "WARN: $DEF not found"
fi

# --- 3) Create hierarchy view ---
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
        <p>یک عنوان وارد کن و بالادستی را انتخاب کن. (اگر اولین بار است، سیستم خودکار «ادمین» را ریشه می‌سازد.)</p>

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
        <p class="muted">نمایش ساده (فعلاً UI/DB). بعداً همین ساختار برای تأیید زیرمجموعه‌ها استفاده می‌شود.</p>

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

# --- 4) Patch routes/admin.js: add GET/POST for hierarchy ---
echo "== API: patch routes/admin.js =="
ADMINJS="$APP/routes/admin.js"
if [ ! -f "$ADMINJS" ]; then
  echo "ERROR: $ADMINJS not found"
  exit 1
fi

if ! grep -q "BRIA_HIERARCHY_ROUTES_BEGIN" "$ADMINJS"; then
  # Insert before module.exports if possible, else append.
  INSERT=$(cat <<'JS'

// BRIA_HIERARCHY_ROUTES_BEGIN
const { Pool: BriaPgPool } = require('pg');
const briaHierarchyPool = new BriaPgPool({ connectionString: process.env.DATABASE_URL });

async function briaEnsureRootAdminNode() {
  const c = await briaHierarchyPool.query('SELECT COUNT(*)::int AS n FROM org_nodes');
  if ((c.rows[0]?.n || 0) === 0) {
    await briaHierarchyPool.query(
      "INSERT INTO org_nodes(title,parent_id,level) VALUES ($1,NULL,1)",
      ['ادمین']
    );
  }
}

async function briaFetchNodesForSelect() {
  // order by level then id (simple & stable)
  const q = await briaHierarchyPool.query(`
    SELECT n.id, COALESCE(n.title,'') AS title, COALESCE(n.level,1) AS level,
           p.title AS parent_title
    FROM org_nodes n
    LEFT JOIN org_nodes p ON p.id = n.parent_id
    ORDER BY COALESCE(n.level,1), n.id
  `);
  return q.rows || [];
}

// GET form
router.get('/definitions/hierarchy', async (req, res) => {
  try {
    await briaEnsureRootAdminNode();
    const nodes = await briaFetchNodesForSelect();
    return res.render('admin_hierarchy', { nodes, error: null, message: null });
  } catch (e) {
    console.error('hierarchy GET error:', e);
    return res.status(500).send('خطا در بارگذاری فرم سلسله مراتب');
  }
});

// POST create node
router.post('/definitions/hierarchy', async (req, res) => {
  const title = (req.body.title || '').trim();
  const parent_id_raw = (req.body.parent_id || '').trim();
  const parent_id = parent_id_raw ? Number(parent_id_raw) : null;

  try {
    await briaEnsureRootAdminNode();

    if (!title) {
      const nodes = await briaFetchNodesForSelect();
      return res.render('admin_hierarchy', { nodes, error: 'عنوان را وارد کنید.', message: null });
    }

    let level = 1;
    if (parent_id) {
      const p = await briaHierarchyPool.query('SELECT id, COALESCE(level,1) AS level FROM org_nodes WHERE id=$1', [parent_id]);
      if (!p.rows.length) {
        const nodes = await briaFetchNodesForSelect();
        return res.render('admin_hierarchy', { nodes, error: 'بالادستی انتخاب‌شده معتبر نیست.', message: null });
      }
      level = (p.rows[0].level || 1) + 1;
    } else {
      // if user didn't choose parent, default to root admin
      const root = await briaHierarchyPool.query("SELECT id, COALESCE(level,1) AS level FROM org_nodes ORDER BY COALESCE(level,1), id LIMIT 1");
      if (root.rows.length) {
        level = (root.rows[0].level || 1) + 1;
        // set parent to root
        await briaHierarchyPool.query(
          'INSERT INTO org_nodes(title,parent_id,level) VALUES ($1,$2,$3)',
          [title, root.rows[0].id, level]
        );
        const nodes = await briaFetchNodesForSelect();
        return res.render('admin_hierarchy', { nodes, error: null, message: 'با موفقیت ثبت شد.' });
      }
    }

    if (level > 10) {
      const nodes = await briaFetchNodesForSelect();
      return res.render('admin_hierarchy', { nodes, error: 'حداکثر عمق ۱۰ لایه است.', message: null });
    }

    await briaHierarchyPool.query(
      'INSERT INTO org_nodes(title,parent_id,level) VALUES ($1,$2,$3)',
      [title, parent_id, level]
    );

    const nodes = await briaFetchNodesForSelect();
    return res.render('admin_hierarchy', { nodes, error: null, message: 'با موفقیت ثبت شد.' });
  } catch (e) {
    console.error('hierarchy POST error:', e);
    const nodes = await briaFetchNodesForSelect().catch(()=>[]);
    return res.render('admin_hierarchy', { nodes, error: 'خطا در ذخیره‌سازی. دوباره تلاش کنید.', message: null });
  }
});
// BRIA_HIERARCHY_ROUTES_END

JS
)

  if grep -q "module.exports" "$ADMINJS"; then
    perl -0777 -i -pe "s/(module\\.exports\\s*=\\s*router\\s*;)/$INSERT\n\$1/s" "$ADMINJS"
  else
    echo "$INSERT" >> "$ADMINJS"
  fi
else
  echo "Hierarchy routes already present."
fi

# --- 5) restart pm2 ---
echo "== Restart pm2 =="
pm2 restart bria-app
echo "Done. Open: /admin/definitions سپس روی «تعریف سلسله مراتب» بزن."
