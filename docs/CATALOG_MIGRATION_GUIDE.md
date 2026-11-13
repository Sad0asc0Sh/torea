## Catalog Migration Guide

### Changes
- Legacy admin catalog endpoints now redirect to the new manager:
  - `GET /admin/settings/catalog` → **301** `/admin/settings/catalog-manager`
  - `GET /admin/settings/catalog-access` → **301** `/admin/settings/catalog-manager`
  - `POST /admin/settings/catalog-access` → **307** `/admin/settings/catalog-manager/apply`
- Request payload limit for catalog forms increased to **10 MB**.
- Catalog discovery skips deprecated catalog routes to avoid reintroducing old items.
- Catalog Manager form now posts only required fields to reduce payload size.
- New cleanup script to deactivate deprecated/duplicate catalog items.

### Cleanup Script

Dry-run (no changes):
```bash
node scripts/cleanup_old_catalog_items.js --dry-run
```

Apply changes:
```bash
node scripts/cleanup_old_catalog_items.js
```

The script:
1) Reports duplicate `route_admin` entries.  
2) Deactivates duplicate items (keeps first per route).  
3) Deactivates deprecated catalog entries (`admin.settings.catalog*`, `admin.settings.catalog-access*`, legacy `/settings/catalog*`).  
4) Rolls back automatically on error.

### Testing & Verification
- Hitting legacy URLs should redirect to catalog-manager with correct status codes.
- Catalog Manager “Save” should succeed without 413 errors.
- Request payload for catalog-manager save should remain under 10 MB.
- After cleanup, duplicated catalog entries should be inactive.

### Rollback
Re-enable catalog items if needed:
```sql
UPDATE catalog_items
SET is_active = TRUE
WHERE key LIKE 'admin.settings.catalog%' 
   OR key LIKE 'admin.settings.catalog-access%';
```
If the cleanup script was run, you can also revert by restoring from DB backups if available.
