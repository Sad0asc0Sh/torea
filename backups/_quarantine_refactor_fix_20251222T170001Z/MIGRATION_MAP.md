# Quarantine Migration Map (20251222T170001Z)

Legacy files moved to `_quarantine_refactor_fix_20251222T170001Z` and their live replacements:

## Routes
- `src/routes/admin.js` → `src/routes/admin/pages.routes.js` (mounted via `src/routes/admin/index.js`)
- `src/routes/brands.definitions.routes.js` → `src/routes/admin/definitions/brands.routes.js`
- `src/routes/products.definitions.routes.js` → `src/routes/admin/definitions/products.routes.js`
- `src/routes/teams.definitions.routes.js` → `src/routes/admin/definitions/teams.routes.js`
- `src/routes/creditPolicy.definitions.routes.js` → `src/routes/admin/definitions/creditPolicy.routes.js`
- `src/routes/adminUsers.definitions.routes.js` → `src/routes/admin/definitions/users.routes.js`

## Views
- `src/views/admin_dashboard.ejs` → `src/views/admin/dashboard.ejs`
- `src/views/admin_approvals.ejs` → `src/views/admin/approvals.ejs`
- `src/views/admin_reports.ejs` → `src/views/admin/reports.ejs`
- `src/views/admin_hierarchy*.ejs` → `src/views/admin/hierarchy*.ejs`
- `src/views/admin_definitions*.ejs` → `src/views/admin/definitions/index.ejs`
- `src/views/admin_def_*` → matching `src/views/admin/definitions/*` files
- `src/views/definitions/*` → matching `src/views/admin/definitions/*`
- `src/views/admin_users.ejs` / `admin_user_edit.ejs` → `src/views/admin/users.ejs` / `admin/user_edit.ejs`

Rollback: move needed files back to their original locations and revert `src/app.js` to require `./routes/admin.js`.
