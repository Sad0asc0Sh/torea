# Definitions (Teams, Brands, Products) — Implementation Guide

**Status:** Implementation Complete ✅  
**Last Updated:** 2025-12-21

This document describes the discovery and implementation plan for the Definitions module (Teams, Brands, Products). For **complete, current implementation details**, see **[docs/ARCHITECTURE_CURRENT.md](./docs/ARCHITECTURE_CURRENT.md)** and **[docs/DEFINITIONS_README.md](./docs/DEFINITIONS_README.md)**.

---

## Implementation Status

✅ **COMPLETED:**
- Teams module (CRUD, members, brands assignment)
- Brands module (CRUD, manager assignment)
- Products module (CRUD, Excel import with auto brand creation)
- Credit Policy module (per org_node configuration)
- Hierarchy module (org_nodes with parent-child arrangement)
- User management (definitions context)
- Database migrations
- Route protection (system admin only)
- Service layer with business logic
- Comprehensive test coverage

---

## Discovery
- **App entry:** `src/app.js` registers sessions via `connect-pg-simple` (`user_sessions`), sets `app.locals.pool`, mounts `/admin` with `adminSession` + `requireSystemAdmin`, and attaches definition routes (`adminUsers.definitions`, `creditPolicy.definitions`, `orgNodes`, legacy `admin`). Main server runs from `src/server.js`.
- **DB config:** `src/config/db.js` exports a `pg.Pool` using `process.env.DATABASE_URL`.
- **Auth/guards:** System admin auth lives in `src/middlewares/systemAdmin.js` (`adminSession`, `requireSystemAdmin`). General guards in `src/middlewares/guards.js` enforce role/status; `auth.js` defines `requireLogin` etc. User display relies on `first_name + last_name` (see `users.service.js` and tests), not `full_name`.
- **Existing definitions modules:**
  - `adminUsers.definitions.routes.js` (System Admin only): CRUD-ish edit for users with org node/role/status controls.
  - `creditPolicy.definitions.routes.js` (System Admin): manages `org_credit_policy` per `org_nodes`, uses form validation, friendly errors.
  - `orgNodes.routes.js` (System Admin): CRUD for `org_nodes` with tree safety checks.
  - `admin.js` includes placeholder pages `/admin/definitions/baskets|brands|products` that only run `SELECT 1` for DB connectivity.
- **Views/layout:** Admin pages share `views/partials/admin_layout.ejs` and `views/partials/admin_menu_tree.ejs`. Placeholder pages exist for brands/products/baskets (`views/admin_def_*.ejs` + `partials/pages/admin_def_*.ejs`). Definitions hub is `views/admin_definitions.ejs`.
- **Tests:** `npm test` uses Node’s `node:test` + `supertest`, mocking DB calls (see `creditPolicy.definitions.routes.test.js`, `adminUsers.definitions.routes.test.js`). Baseline after `npm ci`: all tests passing.
- **DB schema signals (code + docs):**
  - Actively referenced tables: `users`, `org_nodes`, `org_credit_policy`, `credit_sale_requests`, `user_sessions`, `admin_sessions`, `system_admins`, `system_settings`, `baskets`, `brands`, `products`.
  - Spec/ERD (`docs/spec/_spec_text/ToInfinity_FULL.txt`, `05-ERD.md`) lists:
    - `product_groups(id, name)`
    - `brands(id, name)`
    - `products(id, name, code UNIQUE, group_id FK product_groups, brand_id FK brands, is_strategic BOOL DEFAULT false, daily_inventory JSONB, voice_sample BYTEA)`
  - No `teams` tables observed in code/spec; problem statement suggests checking for `teams` / `team_users` — to be confirmed against DB.
- **DB inspection attempt:** `psql "postgresql://bria_user:mah72432@127.0.0.1:5432/bria_db" -c "\dt"` → connection refused (no DATABASE_URL provided in this environment). Will reuse existing tables once live credentials are available; no guesses will be applied.

## Implementation Summary (COMPLETED ✅)

### A) Routes Implemented
✅ All routes created and tested:
- `/admin/definitions/teams/*` - Full CRUD + members + brands
- `/admin/definitions/brands/*` - Full CRUD + toggle active
- `/admin/definitions/products/*` - Full CRUD + import/export
- `/admin/definitions/hierarchy/*` - Node management + arrangement
- `/admin/definitions/credit-policy/*` - Policy configuration
- `/admin/definitions/users/*` - User management

**See:** [docs/ARCHITECTURE_CURRENT.md - Route Map](./docs/ARCHITECTURE_CURRENT.md#route-map)

### B) Views Implemented
✅ All views created:
- `definitions/teams.ejs`, `admin_def_team_form.ejs`, `admin_def_team_members.ejs`, `admin_def_team_brands.ejs`
- `definitions/brands.ejs`, `admin_def_brand_form.ejs`
- `definitions/products.ejs`, `admin_def_product_form.ejs`
- `admin_hierarchy.ejs`, `admin_hierarchy_arrange.ejs`
- `admin_def_credit_policy.ejs`, `admin_def_credit_policy_form.ejs`
- `admin_def_users.ejs`, `admin_def_user_edit.ejs`

### C) Database Tables Created
✅ All migrations applied:
- `migrations/000_fix_consistency.sql` - Teams tables
- `migrations/001_add_brand_manager.sql` - Brand manager
- `migrations/002_add_user_search_indexes.sql` - User indexes
- `migrations/003_add_team_users_indexes.sql` - Team indexes
- `migrations/004_fix_team_users_fks.sql` - FK fixes

### D) Services Implemented
✅ All service layers created:
- `src/services/teams.service.js` - Teams business logic
- `src/services/brands.service.js` - Brands business logic
- `src/services/products.service.js` - Products + Excel import
- `src/services/users.service.js` - User management

### E) Testing
✅ Comprehensive test coverage:
- Route tests: `*.routes.test.js` files
- Service tests: `*.service.test.js` files
- All tests passing

---

## Original Implementation Plan (REFERENCE)

*Note: The sections below describe the original plan. Implementation is complete. For current details, see [docs/ARCHITECTURE_CURRENT.md](./docs/ARCHITECTURE_CURRENT.md).*
- Add indexes on codes/names and FKs. All migrations must use `CREATE TABLE IF NOT EXISTS` / `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.

### D) Validation rules
- Names required (trim, length caps ~150).
- Products: `code` required/unique, `brand_id` and `group_id` must exist, `is_strategic` boolean, numeric inventory fields non-negative.
- Teams: name required/unique; manager_user_id must reference existing user; org_node_id optional but must exist when provided; prevent deleting teams with members.
- Brands: name unique; guard against delete when products exist.
- Excel import: validate headers, deduplicate rows by code, upsert by code, collect row-level errors; reject oversized files; limit rows (e.g., 2k) to avoid crash.
- UI display should use `first_name` + `last_name` (null-safe) when showing users/managers.

### E) Access control
- Protect all new routes with `requireSystemAdmin` (and/or existing session role check used in other definitions).
- Keep `/admin` session cookie scope; no public APIs.
- Enforce status via existing middlewares where applicable; unauthorized → `unauthorized` view or redirect to `/admin/login`.

### F) Logging & error handling
- Log server-side errors with `console.error` (include route context and err.code).
- User-facing messages: friendly Persian text in page, avoid exposing stack, stay on page with preserved form values.
- DB operations wrapped in try/catch; transaction for bulk import to maintain consistency.

### G) Manual QA checklist
1. Login as System Admin (`/admin/login` + OTP) to establish session.
2. Open `/admin/definitions/teams`; create a team, attach manager/user; verify list shows.
3. Edit team name/manager; attempt delete with members → blocked; remove members then delete → success.
4. Create brand; attempt duplicate name → friendly error; delete unused brand OK.
5. Create product group (if UI included) and product with brand/group; see in list; edit fields; delete blocked if constraints hit.
6. Download products template; fill two rows (one duplicate code); import → duplicate rejected, valid rows inserted; list refreshed.
7. Run Excel import with bad headers/empty file → friendly error.
8. Validate menu navigation and breadcrumbs stay consistent; logout still works.

### H) Minimal automated tests
- `node:test` + `supertest` following existing pattern:
  - Mock DB pool for Teams routes: ensure POST rejects missing name, prevents deleting when mock returns member count >0, list renders names.
  - Brands: POST duplicate triggers error; successful insert redirects; list shows created name.
  - Products: POST validates brand/group existence; code uniqueness; GET list renders brand/group names; template download returns file with headers.
  - Import: POST with mocked parsed rows returns summary (inserted/failed) without DB crash.
- Keep tests isolated (no real DB); reset mocks between cases.

---

## Key Features Implemented

### Teams Module
- **CRUD Operations:** Create, read, update, delete teams
- **Team Members:** Assign/remove users (one user = one team constraint)
- **Team Brands:** Assign/remove brands to teams
- **Org Node Integration:** Teams can be linked to org hierarchy
- **Active Toggle:** Enable/disable teams
- **Delete Guards:** Prevent deletion if members exist

### Brands Module
- **CRUD Operations:** Create, read, update, delete brands
- **Manager Assignment:** Assign user as brand manager
- **Code Management:** Optional unique brand codes
- **Active Toggle:** Enable/disable brands with product warning
- **Duplicate Prevention:** Case-insensitive name and code uniqueness

### Products Module
- **CRUD Operations:** Create, read, update, delete products
- **Brand Integration:** Each product belongs to one brand
- **SKU Management:** Optional unique SKU codes
- **Aliases:** Array of product name aliases
- **Key Product Flag:** Mark strategic/key products
- **Active Toggle:** Enable/disable products
- **Pagination:** List products with filtering and pagination
- **Excel Import:** Bulk import from XLSX/CSV
  - Auto-create missing brands (optional)
  - Upsert by SKU code
  - Row-level error reporting
  - File size limit: 10MB
  - Row limit: 5000
- **Template Download:** Excel template with proper headers

---

## Testing Strategy (Implemented)

### Unit Tests
- Service layer tests mock database calls
- Test CRUD operations, validation, error handling
- UUID normalization tests
- Duplicate detection tests

### Integration Tests
- Route tests use supertest
- Mock database pool for isolation
- Test middleware chain
- Test response status and data

### Test Coverage
- ✅ Teams routes and services
- ✅ Brands routes and services
- ✅ Products routes and services
- ✅ Credit Policy routes
- ✅ Admin Users routes
- ✅ Hierarchy routes

### Running Tests
```bash
npm test                                          # All tests
node --test src/routes/teams.definitions.routes.test.js  # Specific test
```

---

## Security & Validation (Implemented)

### Access Control
- ✅ All `/admin/definitions/*` routes require `requireSystemAdmin`
- ✅ Session validation via `adminSession` middleware
- ✅ Role enforcement via `enforceRole` and `enforceStatus`

### Input Validation
- ✅ Required field checks (name, brand_id, etc.)
- ✅ Length limits (~150 chars for names)
- ✅ UUID format validation
- ✅ Duplicate name/code/SKU prevention (case-insensitive)
- ✅ Foreign key existence checks
- ✅ Numeric field validation (non-negative)

### SQL Injection Prevention
- ✅ All queries use parameterized placeholders (`$1`, `$2`)
- ✅ No string concatenation in SQL
- ✅ Input sanitization via pg driver

### File Upload Security
- ✅ File type validation (XLSX/CSV only)
- ✅ File size limit: 10MB
- ✅ Row limit: 5000 rows
- ✅ Header validation
- ✅ Malformed file handling

---

## Known Patterns & Conventions

### User Display
- **Always use:** `first_name + last_name` (NOT `full_name`)
- **Example:** `user.first_name + ' ' + user.last_name`

### UUID Handling
- **Normalize UUIDs:** Use `normalizeUserId()` before DB operations
- **Reason:** Ensures consistent format across sources

### Case-Insensitive Uniqueness
- **Names:** Use `LOWER(name)` in uniqueness checks
- **Codes/SKUs:** Use `LOWER(code)` in uniqueness checks

### Error Handling
- **User-facing:** Friendly Persian messages in views
- **Logging:** Console.error with context
- **Status codes:** 400 (bad request), 403 (forbidden), 500 (error)

### Redirect Patterns
- **Success:** Redirect to list page with success message
- **Error:** Re-render form with error message and preserved values

---

## References

For complete implementation details, see:
- **[docs/ARCHITECTURE_CURRENT.md](./docs/ARCHITECTURE_CURRENT.md)** - Complete architecture reference
- **[docs/DEFINITIONS_README.md](./docs/DEFINITIONS_README.md)** - Detailed Definitions module guide
- **[docs/README.md](./docs/README.md)** - Documentation index
- **[docs/DB_MAP.md](./docs/DB_MAP.md)** - Database tables overview

---

**Document Status:** Implementation Complete ✅  
**Last Updated:** 2025-12-21  
**Maintained By:** Development Team
