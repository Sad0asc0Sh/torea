#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

echo "== 1) Fix broken regex in src/routes/admin/index.js =="
# This pattern was: /^admin\\/?/  (invalid)
# Must be:         /^admin\/?/
sed -i "s/replace(\\\/\\^admin\\\\\\\\\\\/\\?\\\/, '')/replace(\\\/\\^admin\\\\\\/\\?\\\/, '')/g" src/routes/admin/index.js || true
# Fallback exact replacement for the common broken string:
sed -i "s/viewName.replace(\\\/^admin\\\\\\\\\\\/\\?\\\/, '')/viewName.replace(\\\/^admin\\\\\\/\\?\\\/, '')/g" src/routes/admin/index.js || true
sed -i "s/viewName.replace(\\\/^admin\\\\\\\\\\\/\\?\\\/, \"\")/viewName.replace(\\\/^admin\\\\\\/\\?\\\/, \"\")/g" src/routes/admin/index.js || true

echo "== 2) Overwrite src/views/partials/admin_drawer.ejs with safe version (no undefined vars) =="
mkdir -p src/views/partials
cp -f src/views/partials/admin_drawer.ejs "src/views/partials/admin_drawer.ejs.bak.$(date +%Y%m%d_%H%M%S)" 2>/dev/null || true

cat > src/views/partials/admin_drawer.ejs <<'EJS'
<%
  const __drawerActiveKey =
    (typeof activeKey !== 'undefined' && activeKey) ||
    (typeof __activeKey !== 'undefined' ? __activeKey : null);

  const __drawerIsSystemAdmin =
    (typeof isSystemAdmin === 'boolean')
      ? isSystemAdmin
      : (typeof user !== 'undefined' && user && user.role === 'SYSTEM_ADMIN');

  const __items = [
    { key: 'dashboard',   label: 'Dashboard',            href: '/admin' },
    { key: 'definitions', label: 'Definitions',          href: '/admin/definitions' },
    { key: 'tools',       label: 'Tools',                href: '/admin/tools' },
    { key: 'settings',    label: 'Settings',             href: '/admin/settings' },
    { key: 'approvals',   label: 'Approvals',            href: '/admin/approvals' },
    { key: 'account',     label: 'ویرایش حساب کاربری',  href: '/admin/account' },
    { key: 'logout',      label: 'Logout',               href: '/admin/logout' },
  ];

  // اگر جایی خواستی محدودسازی نقش داشته باشی، اینجا انجام بده
  const __menu = __items;
%>

<!-- Hamburger + Drawer (IDs must match existing JS) -->
<button id="hamburger-btn" class="hamburger-btn" aria-label="منو" type="button">
  <span></span><span></span><span></span>
</button>

<div id="drawer-overlay" class="drawer-overlay"></div>

<nav id="drawer" class="drawer" aria-label="Admin navigation">
  <div class="drawer-header">
    <h2 class="drawer-title">منو</h2>
  </div>

  <ul class="drawer-list">
    <% for (const it of __menu) { %>
      <li class="drawer-item">
        <a
          href="<%= it.href %>"
          class="drawer-link <%= (__drawerActiveKey && it.key === __drawerActiveKey) ? 'active' : '' %>"
          data-key="<%= it.key %>"
        ><%= it.label %></a>
      </li>
    <% } %>
  </ul>
</nav>
EJS

echo "== 3) Install deps & run tests locally =="
npm ci
node --test --test-reporter spec

echo "== 4) Commit & push =="
git add src/routes/admin/index.js src/views/partials/admin_drawer.ejs
git commit -m "Fix admin drawer partial (undefined var) and admin router regex" || true
git push

echo "✅ Done."
