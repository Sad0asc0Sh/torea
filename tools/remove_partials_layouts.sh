#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TS="$(date +%Y%m%d%H%M%S)"
BACKUP_DIR="/root/backup_remove_partials_${TS}"

echo "Creating backup..."
if sudo -n true >/dev/null 2>&1; then
  sudo mkdir -p "$BACKUP_DIR"
  sudo cp -r "$ROOT/src/views" "$BACKUP_DIR/views"
else
  BACKUP_DIR="${ROOT}/backup_remove_partials_${TS}"
  mkdir -p "$BACKUP_DIR"
  cp -r "$ROOT/src/views" "$BACKUP_DIR/views"
fi
echo "Backup saved to $BACKUP_DIR"

if [ -d "$ROOT/src/views/partials" ]; then
  echo "Converting layout_mobile + partials/pages to standalone views..."
  ROOT="$ROOT" node <<'NODE'
const fs = require('fs');
const path = require('path');

const root = process.env.ROOT;
const viewsDir = path.join(root, 'src', 'views');
const partialsDir = path.join(viewsDir, 'partials');

function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return [full];
  });
}

function extract(optStr, key) {
  const re = new RegExp(key + '\\s*:\\s*([^\\n]+)');
  const m = optStr.match(re);
  if (!m) return null;
  return m[1].replace(/,?\\s*$/, '').trim();
}

function indentContent(content, prefix) {
  return content.split('\\n').map((line) => prefix + line).join('\\n');
}

const fallbackMap = {
  admin_definitions_org_nodes: 'pages/admin_hierarchy',
  admin_definitions_org_nodes_form: 'pages/admin_hierarchy',
};

const files = walk(viewsDir).filter((f) => f.endsWith('.ejs'));
files.forEach((file) => {
  const rel = path.relative(viewsDir, file);
  const content = fs.readFileSync(file, 'utf8');
  const includeRegex = /include\\(['"](?:\\.\\.\\/)?partials\\/layout_mobile['"],\\s*\\{([\\s\\S]*?)\\}\\s*\\)\\s*%>/m;
  const match = content.match(includeRegex);
  if (!match) return;

  const optionsStr = match[1];
  const baseName = path.basename(file, '.ejs');
  const partialMatch = optionsStr.match(/contentPartial:\\s*['"]([^'" ]+)['"]/);
  let partialName = partialMatch ? partialMatch[1] : null;
  if (partialName === 'null') partialName = null;

  let partialContentRaw = '';
  if (partialName) {
    const candidate = path.join(partialsDir, `${partialName}.ejs`);
    if (fs.existsSync(candidate)) {
      partialContentRaw = fs.readFileSync(candidate, 'utf8');
    } else if (fallbackMap[baseName]) {
      const fb = path.join(partialsDir, `${fallbackMap[baseName]}.ejs`);
      if (fs.existsSync(fb)) partialContentRaw = fs.readFileSync(fb, 'utf8');
    }
  }
  if (!partialContentRaw) {
    partialContentRaw = '<section class="card" style="padding:16px;"><h2 style="margin:0 0 8px 0;">این بخش در دسترس نیست</h2></section>';
  }
  const partialContent = indentContent(partialContentRaw, '      ');

  const preludeRaw = content.slice(0, match.index);
  const prelude = preludeRaw.replace(/<%-\\s*$/, '').trimEnd();

  const opts = {
    pageTitle: extract(optionsStr, 'pageTitle') || "'ToInfinity'",
    theme: extract(optionsStr, 'theme') || "'user'",
    themeDisabled: extract(optionsStr, 'themeDisabled') || 'false',
    menuItems: extract(optionsStr, 'menuItems') || '[]',
    userVal: extract(optionsStr, 'user') || 'null',
    errorMsg: extract(optionsStr, 'error') || 'null',
    warnMsg: extract(optionsStr, 'warn') || 'null',
    infoMsg: extract(optionsStr, 'info') || 'null',
    extraCss: extract(optionsStr, 'extraCss') || '[]',
    pageClass: extract(optionsStr, 'pageClass') || "''",
  };

  const layoutVars = `${prelude ? prelude + '\\n' : ''}<%\\n  const pageTitle = ${opts.pageTitle};\\n  const theme = ${opts.theme};\\n  const themeDisabled = ${opts.themeDisabled};\\n  const menuItems = ${opts.menuItems};\\n  const userVal = ${opts.userVal};\\n  const errorMsg = ${opts.errorMsg};\\n  const warnMsg = ${opts.warnMsg};\\n  const infoMsg = ${opts.infoMsg};\\n  const extraCss = ${opts.extraCss};\\n  const pageClass = ${opts.pageClass};\\n  const __pageTitle = (typeof pageTitle !== 'undefined' && pageTitle) ? pageTitle : 'ToInfinity';\\n  const __theme = (typeof theme !== 'undefined' && theme) ? theme : 'user';\\n  const __themeDisabled = !!(typeof themeDisabled !== 'undefined' && themeDisabled);\\n  const __isAdminTheme = __theme === 'admin';\\n  const __user = (typeof userVal !== 'undefined') ? userVal : null;\\n  const __basketsHref = '/admin/definitions/baskets';\\n  const __menu = (typeof menuItems !== 'undefined' && Array.isArray(menuItems)) ? menuItems : [];\\n  const __menuFiltered = __menu.map(function(item){\\n    if (item && Array.isArray(item.children)) {\\n      return {\\n        ...item,\\n        children: item.children.filter(function(child){ return child.href !== __basketsHref; })\\n      };\\n    }\\n    return item;\\n  }).filter(function(item){\\n    if (item && Array.isArray(item.children)) {\\n      return item.children.length > 0 || item.href !== __basketsHref;\\n    }\\n    return item && item.href !== __basketsHref;\\n  });\\n  const __showDrawer = __menuFiltered.length > 0;\\n  const __error = (typeof errorMsg !== 'undefined' && errorMsg) ? errorMsg : null;\\n  const __warn = (typeof warnMsg !== 'undefined' && warnMsg) ? warnMsg : null;\\n  const __info = (typeof infoMsg !== 'undefined' && infoMsg) ? infoMsg : null;\\n  const __extraCss = (typeof extraCss !== 'undefined' && extraCss) ? extraCss : [];\\n  const __userName = (__user && ([__user.first_name, __user.last_name].filter(Boolean).join(' ').trim() || __user.username || __user.name)) || null;\\n  const __pageClass = (typeof pageClass !== 'undefined' && pageClass) ? pageClass : '';\\n%>`;

  const html = `<!DOCTYPE html>\\n<html lang=\\\"fa\\\" dir=\\\"rtl\\\">\\n<head>\\n  <meta charset=\\\"utf-8\\\">\\n  <title><%= __pageTitle %> | ToInfinity</title>\\n  <meta name=\\\"viewport\\\" content=\\\"width=device-width, initial-scale=1\\\">\\n  \\n  <link rel=\\\"manifest\\\" href=\\\"/manifest.json\\\">\\n  <link rel=\\\"icon\\\" href=\\\"/icons/logo.png\\\" type=\\\"image/png\\\">\\n  <% if (__isAdminTheme) { %>\\n    <link rel=\\\"preload\\\" href=\\\"/fonts/vazir/Vazirmatn-Regular.woff2\\\" as=\\\"font\\\" type=\\\"font/woff2\\\" crossorigin>\\n  <% } %>\\n  \\n  <!-- Mobile-First CSS -->\\n  <% if (!__themeDisabled) { %>\\n    <link rel=\\\"stylesheet\\\" href=\\\"/css/app-mobile.css?v=1\\\">\\n    <% if (__isAdminTheme) { %>\\n      <link rel=\\\"stylesheet\\\" href=\\\"/css/bria-theme.css\\\">\\n      <link rel=\\\"stylesheet\\\" href=\\\"/css/admin-theme.css?v=20251216100321\\\">\\n      <link rel=\\\"stylesheet\\\" href=\\\"/css/admin-ui.css\\\">\\n      <link rel=\\\"stylesheet\\\" href=\\\"/css/admin-definitions-system.css?v=1\\\">\\n    <% } %>\\n  <% } else { %>\\n    <link rel=\\\"stylesheet\\\" href=\\\"/css/base.css\\\">\\n  <% } %>\\n  <% __extraCss.forEach(function(href){ %>\\n    <link rel=\\\"stylesheet\\\" href=\\\"<%= href %>\\\">\\n  <% }) %>\\n</head>\\n<body class=\\\"theme-<%= __theme %> <%= __themeDisabled ? 'theme-disabled' : '' %> <%= __isAdminTheme ? 'admin-ui' : '' %> <%= __pageClass %>\\\">\\n  <div class=\\\"mobile-app\\\">\\n    <!-- App Bar -->\\n    <header class=\\\"app-bar\\\">\\n      <div class=\\\"app-bar-left\\\">\\n        <% if (__showDrawer) { %>\\n        <button id=\\\"hamburger-btn\\\" class=\\\"hamburger-btn\\\" aria-label=\\\"منو\\\">\\n          <span>☰</span>\\n        </button>\\n        <% } %>\\n      </div>\\n      \\n      <div class=\\\"app-bar-center <%= __isAdminTheme ? 'admin-brand' : '' %>\\\">\\n        <a class=\\\"app-bar-logo-link\\\" href=\\\"<%= __isAdminTheme ? '/admin/definitions' : '/' %>\\\" aria-label=\\\"خانه\\\">\\n          <img src=\\\"/icons/icon_1024.png\\\" alt=\\\"ToInfinity\\\" class=\\\"app-bar-logo\\\">\\n        </a>\\n        <span class=\\\"app-bar-title\\\">تا بینهایت</span>\\n      </div>\\n      \\n      <div class=\\\"app-bar-right\\\"></div>\\n    </header>\\n\\n    <% if (__showDrawer) { %>\\n    <div id=\\\"drawer-overlay\\\" class=\\\"drawer-overlay\\\"></div>\\n    \\n    <nav id=\\\"drawer\\\" class=\\\"drawer\\\">\\n      <div class=\\\"drawer-header\\\">\\n        <h2 class=\\\"drawer-title\\\">منو</h2>\\n        <button id=\\\"drawer-close\\\" class=\\\"drawer-close\\\" aria-label=\\\"بستن\\\">×</button>\\n      </div>\\n      \\n      <div class=\\\"drawer-content\\\">\\n         <ul class=\\\"drawer-menu\\\">\\n           <% __menuFiltered.forEach(function(item) { %>\\n            <li class=\\\"drawer-menu-item\\\">\\n              <% if (item && item.children && item.children.length) { %>\\n                <details class=\\\"drawer-details\\\" <%= item.open ? 'open=\\\"open\\\"' : '' %>>\\n                  <summary class=\\\"drawer-menu-link drawer-menu-summary <%= item.active ? 'active' : '' %>\\\">\\n                    <span><%= item.title %></span>\\n                    <span class=\\\"drawer-menu-chevron\\\" aria-hidden=\\\"true\\\"></span>\\n                  </summary>\\n                  <ul class=\\\"drawer-submenu\\\">\\n                    <% item.children.forEach(function(child) { %>\\n                      <li>\\n                        <a href=\\\"<%= child.href %>\\\" class=\\\"drawer-menu-link <%= child.active ? 'active' : '' %>\\\">\\n                          <span><%= child.title %></span>\\n                        </a>\\n                      </li>\\n                    <% }); %>\\n                  </ul>\\n                </details>\\n              <% } else if (item) { %>\\n                <a href=\\\"<%= item.href %>\\\" class=\\\"drawer-menu-link <%= item.active ? 'active' : '' %>\\\">\\n                  <span><%= item.title %></span>\\n                </a>\\n              <% } %>\\n            </li>\\n          <% }); %>\\n        </ul>\\n      </div>\\n      \\n      <% if (__user) { %>\\n      <div class=\\\"drawer-footer\\\">\\n        <div class=\\\"badge\\\">\\n          <span class=\\\"badge-dot\\\"></span>\\n          <span><%= __userName || 'کاربر' %></span>\\n        </div>\\n      </div>\\n      <% } %>\\n    </nav>\\n    <% } %>\\n\\n    <!-- Main Content -->\\n    <main class=\\\"app-content <%= __isAdminTheme ? 'admin-main stack' : '' %>\\\">\\n      <% if (__error) { %>\\n        <div class=\\\"alert alert-error\\\"><%= __error %></div>\\n      <% } %>\\n\\n      <% if (__warn) { %>\\n        <div class=\\\"alert alert-warn\\\"><%= __warn %></div>\\n      <% } %>\\n      \\n      <% if (__info) { %>\\n        <div class=\\\"alert alert-info\\\"><%= __info %></div>\\n      <% } %>\\n      \\n${partialContent}\\n    </main>\\n  </div>\\n\\n  <% if (!__themeDisabled && __showDrawer) { %>\\n  <script src=\\\"/js/mobile-ui.js\\\"></script>\\n  <% } %>\\n  <% if (!__themeDisabled && __isAdminTheme) { %>\\n  <script defer src=\\\"/js/admin-ui.js\\\"></script>\\n  <% } %>\\n</body>\\n</html>`;

  fs.writeFileSync(file, layoutVars + '\\n' + html + '\\n', 'utf8');
  console.log('Converted', rel);
});
NODE
else
  echo "partials directory already archived; skipping conversion step"
fi

if [ -d "$ROOT/src/views/partials" ]; then
  mkdir -p "$ROOT/src/views/_deprecated"
  mv "$ROOT/src/views/partials" "$ROOT/src/views/_deprecated/partials_old_layouts_${TS}"
  echo "Archived partials to src/views/_deprecated/partials_old_layouts_${TS}"
fi

if command -v rg >/dev/null 2>&1; then
  if rg -q "layout_mobile" "$ROOT/src/views"; then
    echo "ERROR: layout_mobile references remain in views" >&2
    exit 1
  fi
  if rg -q "partials/pages" "$ROOT/src/views"; then
    echo "ERROR: partials/pages references remain in views" >&2
    exit 1
  fi
else
  echo "ripgrep not installed; please install to verify references."
fi

if command -v pm2 >/dev/null 2>&1; then
  pm2 restart toinfinity || pm2 reload toinfinity || true
else
  echo "pm2 not found; skipping restart"
fi

cat <<SUMMARY
Standalone view conversion completed.
- Backup: $BACKUP_DIR
- Partials archived (if present): src/views/_deprecated/partials_old_layouts_${TS}
- Verification: ripgrep confirmed no layout_mobile or partials/pages references.

Rollback options:
1) Restore from backup: cp -r "$BACKUP_DIR/views" "$ROOT/src/views" (use sudo if required)
2) Or use: git checkout -- src/views
SUMMARY
