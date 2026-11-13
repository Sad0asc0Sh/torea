#!/usr/bin/env bash
set -euo pipefail

APP_DIR="/opt/bria-app"
ADMIN_JS="$APP_DIR/routes/admin.js"
HIER_EJS="$APP_DIR/views/admin_hierarchy.ejs"

if [[ ! -f "$ADMIN_JS" ]]; then
  echo "ERROR: $ADMIN_JS not found"
  exit 1
fi
if [[ ! -f "$HIER_EJS" ]]; then
  echo "ERROR: $HIER_EJS not found"
  exit 1
fi

TS="$(date +%F_%H%M%S)"
BK="/opt/bria-backups/${TS}_hierarchy_crud_v1"
mkdir -p "$BK"
cp -a "$ADMIN_JS" "$BK/admin.js.bak"
cp -a "$HIER_EJS" "$BK/admin_hierarchy.ejs.bak"
echo "Backup saved: $BK"

# ---------------------------
# Patch admin.js (idempotent)
# ---------------------------
if grep -q "BRIA_HIERARCHY_CRUD_V1" "$ADMIN_JS"; then
  echo "admin.js already patched (BRIA_HIERARCHY_CRUD_V1). Skipping admin.js patch."
else
  # 1) ensure fetchNodes includes n.parent_id
  perl -0777 -i -pe 's/SELECT\s+n\.id,\s+COALESCE\(n\.title,\x27\x27\)\s+AS\s+title,\s+COALESCE\(n\.level,1\)\s+AS\s+level,\s*\n\s*p\.title\s+AS\s+parent_title/SELECT n.id, COALESCE(n.title,\x27\x27) AS title, COALESCE(n.level,1) AS level,\n           n.parent_id,\n           p.title AS parent_title/s' "$ADMIN_JS"

  # 2) replace GET /definitions/hierarchy block to support edit + messages
  perl -0777 -i -pe 's#router\.get\(\x27/definitions/hierarchy\x27,\s*async\s*\(req,\s*res\)\s*=>\s*\{\s*try\s*\{\s*await\s+ensureRootAdminNode\(\);\s*const\s+nodes\s*=\s*await\s+fetchNodes\(\);\s*return\s+res\.render\(\x27admin_hierarchy\x27,\s*\{\s*nodes,\s*error:\s*null,\s*message:\s*null\s*\}\);\s*\}\s*catch\s*\(e\)\s*\{\s*console\.error\(\x27hierarchy GET error:\x27,\s*e\);\s*return\s+res\.status\(500\)\.send\(\x27[^']*\x27\);\s*\}\s*\}\);#// BRIA_HIERARCHY_CRUD_V1\nrouter.get('\''/definitions/hierarchy'\'', async (req, res) => {\n  try {\n    await ensureRootAdminNode();\n    const nodes = await fetchNodes();\n\n    const editId = req.query.edit ? Number(req.query.edit) : null;\n    const editNode = editId ? nodes.find(x => x.id === editId) : null;\n\n    return res.render('\''admin_hierarchy'\'', {\n      user: req.session?.user || null,\n      nodes,\n      editNode: editNode || null,\n      error: req.query.err || null,\n      message: req.query.ok || null,\n    });\n  } catch (e) {\n    console.error('\''hierarchy GET error:'\'', e);\n    return res.status(500).send('\''خطا در بارگذاری فرم سلسله مراتب'\'');\n  }\n});#s' "$ADMIN_JS"

  # 3) add update/delete routes before end marker
  perl -0777 -i -pe 's#// BRIA_HIERARCHY_ROUTES_END#\n// BRIA_HIERARCHY_CRUD_V1_ROUTES_BEGIN\n\nrouter.post('\''/definitions/hierarchy/:id/delete'\'', async (req, res) => {\n  const id = Number(req.params.id);\n  try {\n    await ensureRootAdminNode();\n\n    if (!id) return res.redirect('\''/admin/definitions/hierarchy?err='\'' + encodeURIComponent('\''شناسه نامعتبر است'\''));\n\n    const cur = await hierarchyPool.query('\''SELECT id, parent_id, COALESCE(level,1) AS level FROM org_nodes WHERE id=$1'\'', [id]);\n    if (!cur.rows.length) return res.redirect('\''/admin/definitions/hierarchy?err='\'' + encodeURIComponent('\''آیتم پیدا نشد'\''));\n\n    // prevent deleting root\n    if (!cur.rows[0].parent_id || cur.rows[0].level === 1) {\n      return res.redirect('\''/admin/definitions/hierarchy?err='\'' + encodeURIComponent('\''حذف ریشه مجاز نیست'\''));\n    }\n\n    const ch = await hierarchyPool.query('\''SELECT COUNT(*)::int AS c FROM org_nodes WHERE parent_id=$1'\'', [id]);\n    if (ch.rows[0].c > 0) {\n      return res.redirect('\''/admin/definitions/hierarchy?err='\'' + encodeURIComponent('\''این ردیف زیرمجموعه دارد؛ ابتدا زیرمجموعه‌ها را حذف کنید'\''));\n    }\n\n    await hierarchyPool.query('\''DELETE FROM org_nodes WHERE id=$1'\'', [id]);\n    return res.redirect('\''/admin/definitions/hierarchy?ok='\'' + encodeURIComponent('\''حذف با موفقیت انجام شد'\''));\n  } catch (e) {\n    console.error('\''hierarchy DELETE error:'\'', e);\n    return res.redirect('\''/admin/definitions/hierarchy?err='\'' + encodeURIComponent('\''خطا در حذف'\''));\n  }\n});\n\nrouter.post('\''/definitions/hierarchy/:id/update'\'', async (req, res) => {\n  const id = Number(req.params.id);\n  const title = (req.body.title || '\'''\'').trim();\n  const parentRaw = (req.body.parent_id || '\'''\'').trim();\n  let parent_id = parentRaw ? Number(parentRaw) : null;\n\n  try {\n    await ensureRootAdminNode();\n\n    if (!id) return res.redirect('\''/admin/definitions/hierarchy?err='\'' + encodeURIComponent('\''شناسه نامعتبر است'\''));\n    if (!title) return res.redirect('\''/admin/definitions/hierarchy?edit='\'' + id + '\''&err='\'' + encodeURIComponent('\''عنوان نمی‌تواند خالی باشد'\''));\n\n    const cur = await hierarchyPool.query('\''SELECT id, parent_id, COALESCE(level,1) AS level FROM org_nodes WHERE id=$1'\'', [id]);\n    if (!cur.rows.length) return res.redirect('\''/admin/definitions/hierarchy?err='\'' + encodeURIComponent('\''آیتم پیدا نشد'\''));\n\n    // root: only title can change\n    const isRoot = (!cur.rows[0].parent_id || cur.rows[0].level === 1);\n    if (isRoot) {\n      await hierarchyPool.query('\''UPDATE org_nodes SET title=$1 WHERE id=$2'\'', [title, id]);\n      return res.redirect('\''/admin/definitions/hierarchy?ok='\'' + encodeURIComponent('\''ویرایش انجام شد'\''));\n    }\n\n    if (parent_id === id) parent_id = null;\n\n    // if parent empty -> attach to root\n    if (!parent_id) {\n      const root = await hierarchyPool.query('\''SELECT id, COALESCE(level,1) AS level FROM org_nodes ORDER BY COALESCE(level,1), id LIMIT 1'\'');\n      parent_id = root.rows[0]?.id || null;\n    }\n\n    // prevent loop: parent cannot be in descendants of current\n    const loop = await hierarchyPool.query(`\n      WITH RECURSIVE sub AS (\n        SELECT id FROM org_nodes WHERE parent_id = $1\n        UNION ALL\n        SELECT o.id FROM org_nodes o JOIN sub s ON o.parent_id = s.id\n      )\n      SELECT 1 AS hit FROM sub WHERE id = $2 LIMIT 1\n    `, [id, parent_id]);\n\n    if (loop.rows.length) {\n      return res.redirect('\''/admin/definitions/hierarchy?edit='\'' + id + '\''&err='\'' + encodeURIComponent('\''بالادستی انتخاب‌شده باعث حلقه در ساختار می‌شود'\''));\n    }\n\n    const pr = await hierarchyPool.query('\''SELECT COALESCE(level,1) AS level FROM org_nodes WHERE id=$1'\'', [parent_id]);\n    if (!pr.rows.length) {\n      return res.redirect('\''/admin/definitions/hierarchy?edit='\'' + id + '\''&err='\'' + encodeURIComponent('\''بالادستی معتبر نیست'\''));\n    }\n\n    const newLevel = (pr.rows[0].level || 1) + 1;\n    if (newLevel > 10) {\n      return res.redirect('\''/admin/definitions/hierarchy?edit='\'' + id + '\''&err='\'' + encodeURIComponent('\''حداکثر عمق ۱۰ لایه است'\''));\n    }\n\n    await hierarchyPool.query('\''UPDATE org_nodes SET title=$1, parent_id=$2, level=$3 WHERE id=$4'\'', [title, parent_id, newLevel, id]);\n    return res.redirect('\''/admin/definitions/hierarchy?ok='\'' + encodeURIComponent('\''ویرایش با موفقیت انجام شد'\''));\n\n  } catch (e) {\n    console.error('\''hierarchy UPDATE error:'\'', e);\n    return res.redirect('\''/admin/definitions/hierarchy?edit='\'' + id + '\''&err='\'' + encodeURIComponent('\''خطا در ویرایش'\''));\n  }\n});\n\n// BRIA_HIERARCHY_CRUD_V1_ROUTES_END\n\n// BRIA_HIERARCHY_ROUTES_END#s' "$ADMIN_JS"

  echo "admin.js patched successfully."
fi

# ---------------------------------------
# Replace admin_hierarchy.ejs with CRUD UI
# ---------------------------------------
cat >"$HIER_EJS" <<'EJS'
<!DOCTYPE html>
<html lang="fa" dir="rtl">
<head>
  <meta charset="utf-8" />
  <title>سلسله مراتب | To infinity</title>
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/vazirmatn@33.003.0/Vazirmatn-Variable-font-face.css">
  <style>
    body{margin:0;background:#020617;color:#e5e7eb;font-family:"Vazirmatn",system-ui;}
    .wrap{max-width:980px;margin:0 auto;padding:1.2rem;}
    .top{display:flex;justify-content:space-between;align-items:center;margin-bottom:1.1rem;gap:12px}
    .title{font-size:1rem;margin-bottom:.25rem;}
    .sub{font-size:.8rem;color:#9ca3af;line-height:1.6}
    .back a{font-size:.8rem;color:#a5b4fc;text-decoration:none;}
    .card{border-radius:18px;background:#020617;border:1px solid rgba(148,163,184,.3);padding:1rem .9rem;margin-bottom:.9rem;}
    .card h2{font-size:.95rem;margin:0 0 .5rem 0}
    .card p{font-size:.8rem;color:#9ca3af;margin:.25rem 0 .8rem 0;line-height:1.7}
    .btn-row{display:flex;flex-wrap:wrap;gap:.55rem;margin-top:.5rem;justify-content:flex-start;}
    .btn{padding:.45rem .8rem;border-radius:999px;border:1px solid rgba(148,163,184,.45);background:#020617;color:#e5e7eb;font-size:.78rem;text-decoration:none;cursor:pointer;display:inline-flex;align-items:center;gap:.4rem}
    .btn.primary{border-color:rgba(99,102,241,.8);background:rgba(79,70,229,.12);color:#c7d2fe;}
    .btn.danger{border-color:rgba(248,113,113,.65);background:rgba(239,68,68,.10);color:#fecaca;}
    .btn.ghost{border-color:rgba(148,163,184,.35);background:transparent;color:#e5e7eb;}
    .grid{display:grid;grid-template-columns:1fr 1fr;gap:.75rem}
    .field label{display:block;font-size:.78rem;color:#cbd5e1;margin-bottom:.35rem}
    .field input,.field select{
      width:100%;box-sizing:border-box;background:#020617;color:#e5e7eb;
      border:1px solid rgba(148,163,184,.35);border-radius:14px;padding:.6rem .75rem;
      outline:none;
    }
    .field input:focus,.field select:focus{border-color:rgba(99,102,241,.75)}
    .msg{border-radius:14px;padding:.7rem .8rem;font-size:.8rem;margin-bottom:.75rem;line-height:1.7}
    .msg.ok{border:1px solid rgba(34,197,94,.35);background:rgba(34,197,94,.10);color:#bbf7d0;}
    .msg.err{border:1px solid rgba(239,68,68,.35);background:rgba(239,68,68,.08);color:#fecaca;}
    table{width:100%;border-collapse:collapse;font-size:.8rem;}
    th,td{padding:.75rem .6rem;border-bottom:1px solid rgba(148,163,184,.18);text-align:right;vertical-align:middle;}
    th{color:#cbd5e1;font-weight:600}
    .actions{display:flex;gap:.45rem;flex-wrap:wrap}
    .muted{color:#94a3b8;font-size:.78rem}
    @media(max-width:720px){
      .grid{grid-template-columns:1fr}
      .actions{justify-content:flex-start}
    }
  </style>
</head>
<body>
<div class="wrap">

  <div class="top">
    <div>
      <div class="title">تعریف سلسله مراتب سازمانی</div>
      <div class="sub">اینجا می‌توانید لایه‌ها/سمت‌ها را تعریف کنید تا هر مدیر بتواند زیرمجموعه‌های خودش را مدیریت کند (حداکثر ۱۰ لایه).</div>
    </div>
    <div class="back"><a href="/admin/definitions">◂ بازگشت به تعاریف</a></div>
  </div>

  <% if (message) { %>
    <div class="msg ok"><%= message %></div>
  <% } %>
  <% if (error) { %>
    <div class="msg err"><%= error %></div>
  <% } %>

  <div class="card">
    <h2><%= (editNode ? "ویرایش سمت/لایه" : "افزودن سمت/لایه جدید") %></h2>
    <p>عنوان را وارد کن و بالادستی را انتخاب کن. اگر دیتابیس خالی باشد، «ادمین» خودکار ریشه می‌شود.</p>

    <form method="POST" action="<%= (editNode ? ('/admin/definitions/hierarchy/' + editNode.id + '/update') : '/admin/definitions/hierarchy') %>">
      <div class="grid">
        <div class="field">
          <label>عنوان سمت/لایه</label>
          <input name="title" placeholder="مثلاً مدیر فروش ارشد" value="<%= editNode ? editNode.title : '' %>" />
        </div>

        <div class="field">
          <label>بالادستی</label>
          <select name="parent_id">
            <option value="">— انتخاب بالادستی —</option>
            <% (nodes || []).forEach(function(n){ %>
              <% if (!editNode || n.id !== editNode.id) { %>
                <option value="<%= n.id %>"
                  <%= (editNode && editNode.parent_id && Number(editNode.parent_id)===Number(n.id)) ? 'selected' : '' %>>
                  <%= n.title %> (سطح <%= n.level %>)
                </option>
              <% } %>
            <% }); %>
          </select>
          <div class="muted" style="margin-top:.35rem">اگر چیزی انتخاب نکنی، به ریشه (ادمین) وصل می‌شود.</div>
        </div>
      </div>

      <div class="btn-row" style="margin-top:.85rem">
        <button class="btn primary" type="submit"><%= editNode ? "ذخیره تغییرات" : "ثبت" %></button>
        <% if (editNode) { %>
          <a class="btn ghost" href="/admin/definitions/hierarchy">لغو ویرایش</a>
        <% } else { %>
          <button class="btn ghost" type="reset">انصراف</button>
        <% } %>
      </div>
    </form>
  </div>

  <div class="card">
    <h2>لیست لایه‌ها</h2>
    <p>برای اصلاح اشتباه، می‌توانی هر ردیف را ویرایش یا حذف کنی. (نمایش شناسه حذف شده تا فرم شلوغ نشود.)</p>

    <div style="overflow:auto">
      <table>
        <thead>
          <tr>
            <th style="min-width:180px">عنوان</th>
            <th style="min-width:80px">سطح</th>
            <th style="min-width:160px">بالادستی</th>
            <th style="min-width:220px">عملیات</th>
          </tr>
        </thead>
        <tbody>
          <% (nodes || []).forEach(function(n){ %>
            <tr>
              <td><%= n.title %></td>
              <td><%= n.level %></td>
              <td><%= n.parent_title ? n.parent_title : "—" %></td>
              <td>
                <div class="actions">
                  <a class="btn primary" href="/admin/definitions/hierarchy?edit=<%= n.id %>">ویرایش</a>

                  <% if (n.parent_id && n.level !== 1) { %>
                    <form method="POST" action="/admin/definitions/hierarchy/<%= n.id %>/delete" style="margin:0">
                      <button class="btn danger" type="submit" onclick="return confirm('حذف شود؟ اگر زیرمجموعه داشته باشد حذف نمی‌شود.')">حذف</button>
                    </form>
                  <% } else { %>
                    <span class="muted">ریشه قابل حذف نیست</span>
                  <% } %>
                </div>
              </td>
            </tr>
          <% }); %>

          <% if (!nodes || nodes.length === 0) { %>
            <tr><td colspan="4" class="muted">هنوز چیزی ثبت نشده.</td></tr>
          <% } %>
        </tbody>
      </table>
    </div>

  </div>

</div>
</body>
</html>
EJS

echo "admin_hierarchy.ejs replaced with CRUD UI."

# restart app
pm2 restart bria-app >/dev/null
echo "pm2 restarted bria-app"

# quick health checks
code1="$(curl -s -o /dev/null -w "%{http_code}" http://127.0.0.1:3000/admin/definitions/hierarchy || true)"
echo "Local GET /admin/definitions/hierarchy => HTTP $code1"
