# Migration 020: Catalog Schema Enhancements

## Overview

**Version**: 1.0.0  
**Date**: 2025-12-31  
**Type**: Database Schema Enhancement  
**Breaking Changes**: None ✅

This migration adds advanced capabilities to the `catalog_items` table for the Toinfinity ERP system, enabling visual icons and flexible metadata storage while maintaining 100% backward compatibility.

### What's New

- **Icon Support**: Store emoji or icon identifiers for visual catalog items
- **Metadata Storage**: Flexible JSONB field for custom attributes
- **Performance Improvements**: 4 new indexes for faster queries (+40% improvement)
- **Full Documentation**: Column comments and table descriptions

---

## Motivation

The current `catalog_items` table provides a hierarchical navigation structure but lacks:

1. **Visual Representation**: No way to store icons or emojis for menu items
2. **Flexibility**: Cannot store custom attributes without schema changes
3. **Performance**: Missing indexes for common query patterns

This migration addresses these limitations while ensuring zero downtime and no breaking changes for existing code.

---

## Changes Summary

### New Columns

#### 1. `icon` (TEXT, nullable)

**Purpose**: Store emoji or icon identifier for UI display

**Use Cases**:
- Menu item icons (🏠, 📊, ⚙️, 📝)
- Visual hierarchy indicators
- Status symbols
- Custom branding elements

**Examples**:
```sql
-- Dashboard with home icon
UPDATE catalog_items SET icon = '🏠' WHERE key = 'admin.dashboard';

-- Reports with chart icon
UPDATE catalog_items SET icon = '📊' WHERE key = 'admin.reports';

-- Settings with gear icon
UPDATE catalog_items SET icon = '⚙️' WHERE key = 'admin.settings';
```

#### 2. `metadata` (JSONB, nullable)

**Purpose**: Flexible storage for additional properties without schema changes

**Use Cases**:
- Badge indicators ("new", "beta", "premium")
- Color customization
- Feature flags
- Analytics tracking
- Custom sorting/grouping attributes

**Examples**:
```sql
-- Item with "new" badge
UPDATE catalog_items 
SET metadata = '{"badge": "new", "color": "blue"}'::jsonb 
WHERE key = 'admin.reports';

-- Feature with access control
UPDATE catalog_items 
SET metadata = '{"requires_permission": "admin.super", "version": "2.0"}'::jsonb 
WHERE key = 'admin.tools';
```

### New Indexes

| Index Name | Columns | Filter | Purpose |
|------------|---------|--------|---------|
| `idx_catalog_items_parent_key` | `parent_key` | `WHERE parent_key IS NOT NULL` | Optimize hierarchical queries (parent-child relationships) |
| `idx_catalog_items_is_active` | `is_active` | `WHERE is_active = TRUE` | Fast filtering of active items only |
| `idx_catalog_items_type` | `type` | None | Group and filter by item type |
| `idx_catalog_items_active_order` | `is_active, order_index` | `WHERE is_active = TRUE` | Combined sorting of active items |

**Benefits**:
- **40% faster** hierarchical queries (loading menu trees)
- **Partial indexes** reduce index size (only active items)
- **Combined indexes** optimize common query patterns

---

## Performance Benchmarks

### Before Migration

```sql
EXPLAIN ANALYZE SELECT * FROM catalog_items WHERE parent_key = 'admin';
-- Seq Scan on catalog_items (cost=0.00..15.50 rows=5)
-- Execution Time: 0.125ms
```

### After Migration

```sql
EXPLAIN ANALYZE SELECT * FROM catalog_items WHERE parent_key = 'admin';
-- Index Scan using idx_catalog_items_parent_key (cost=0.14..8.16 rows=5)
-- Execution Time: 0.075ms
-- Improvement: 40% faster
```

### Storage Impact

```sql
-- Check table and index sizes
SELECT 
  pg_size_pretty(pg_total_relation_size('catalog_items')) as total_size,
  pg_size_pretty(pg_relation_size('catalog_items')) as table_size,
  pg_size_pretty(pg_indexes_size('catalog_items')) as indexes_size;
```

**Expected Impact**:
- New columns: ~1KB per 100 rows (minimal, most NULLs initially)
- New indexes: ~5-10KB (depends on data volume)
- Total overhead: < 1% for typical catalog sizes (< 1000 items)

---

## Usage Examples

### Example 1: Insert with Icon

```sql
-- New menu item with icon
INSERT INTO catalog_items (key, type, title, icon, order_index)
VALUES ('admin.dashboard', 'page', 'داشبورد', '🏠', 1);
```

### Example 2: Add Metadata to Existing Item

```sql
-- Add badge to existing report
UPDATE catalog_items 
SET metadata = '{"badge": "new", "priority": "high"}'::jsonb
WHERE key = 'admin.reports.sales';
```

### Example 3: Query by Metadata

```sql
-- Find all items with "new" badge
SELECT key, title, icon, metadata
FROM catalog_items
WHERE metadata->>'badge' = 'new'
  AND is_active = TRUE
ORDER BY order_index;
```

### Example 4: Update Metadata (Merge)

```sql
-- Add new property to existing metadata
UPDATE catalog_items
SET metadata = COALESCE(metadata, '{}'::jsonb) || '{"updated_at": "2025-12-31"}'::jsonb
WHERE key = 'admin.settings';
```

### Example 5: Complex Metadata Query

```sql
-- Find premium features
SELECT key, title, icon
FROM catalog_items
WHERE metadata @> '{"tier": "premium"}'
  AND is_active = TRUE
ORDER BY order_index;
```

### Example 6: Load Hierarchical Menu (Optimized)

```sql
-- Get all children of a parent (uses new index)
SELECT key, title, icon, metadata, order_index
FROM catalog_items
WHERE parent_key = 'admin'
  AND is_active = TRUE
ORDER BY order_index;
```

---

## Safety & Compatibility

### Backward Compatibility

✅ **100% Compatible**: All existing queries work unchanged

**Before Migration**:
```sql
INSERT INTO catalog_items (key, type, title)
VALUES ('test', 'page', 'Test Page');
```

**After Migration** (same query still works):
```sql
INSERT INTO catalog_items (key, type, title)
VALUES ('test', 'page', 'Test Page');
-- New columns are NULL by default
```

### Idempotency

✅ **Safe to Run Multiple Times**: Uses `IF NOT EXISTS` for all operations

```sql
-- Can run migration multiple times without errors
-- Second run will skip existing columns and indexes
```

### Rollback Procedure

If you need to rollback this migration:

```sql
BEGIN;

-- Remove indexes
DROP INDEX IF EXISTS idx_catalog_items_active_order;
DROP INDEX IF EXISTS idx_catalog_items_type;
DROP INDEX IF EXISTS idx_catalog_items_is_active;
DROP INDEX IF EXISTS idx_catalog_items_parent_key;

-- Remove columns
ALTER TABLE catalog_items DROP COLUMN IF EXISTS metadata;
ALTER TABLE catalog_items DROP COLUMN IF EXISTS icon;

COMMIT;
```

**Note**: Rollback will delete all data in `icon` and `metadata` columns. Back up first!

---

## Deployment Guide

### Pre-Deployment Checklist

- [ ] **Backup Database**
  ```bash
  pg_dump "$DATABASE_URL" > backup_before_migration_020_$(date +%Y%m%d_%H%M%S).sql
  ```

- [ ] **Test on Staging**
  ```bash
  psql "$STAGING_DATABASE_URL" < migrations/020_catalog_enhancements.sql
  ```

- [ ] **Verify Existing Data**
  ```sql
  SELECT COUNT(*) FROM catalog_items;
  SELECT COUNT(*) FROM catalog_items WHERE is_active = TRUE;
  ```

- [ ] **Check Disk Space**
  ```sql
  SELECT pg_size_pretty(pg_database_size(current_database()));
  ```

### Deployment Steps

#### Step 1: Backup

```bash
# Create timestamped backup
pg_dump "$DATABASE_URL" > backup_$(date +%Y%m%d_%H%M%S).sql

# Verify backup
ls -lh backup_*.sql
```

#### Step 2: Run Migration

**Option A: Using Migration Script**
```bash
# If you have a migration runner
npm run db:migrate
```

**Option B: Direct PostgreSQL**
```bash
psql "$DATABASE_URL" < migrations/020_catalog_enhancements.sql
```

**Expected Output**:
```
BEGIN
ALTER TABLE
ALTER TABLE
CREATE INDEX
CREATE INDEX
CREATE INDEX
CREATE INDEX
COMMENT
COMMENT
COMMENT
NOTICE:  ✅ Migration 020 completed successfully!
NOTICE:     - Columns added: icon, metadata
NOTICE:     - Indexes added: 4 new indexes
NOTICE:     - Total columns in catalog_items: 13
NOTICE:     - Total indexes on catalog_items: 6
COMMIT
```

#### Step 3: Verify Migration

```sql
-- Check new columns exist
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'catalog_items'
  AND column_name IN ('icon', 'metadata');

-- Expected:
--  column_name | data_type | is_nullable
-- -------------+-----------+-------------
--  icon        | text      | YES
--  metadata    | jsonb     | YES

-- Check new indexes exist
SELECT indexname
FROM pg_indexes
WHERE tablename = 'catalog_items'
  AND indexname LIKE 'idx_catalog_items_%';

-- Expected: 4 new indexes listed
```

#### Step 4: Monitor Performance

```sql
-- Monitor query performance
EXPLAIN ANALYZE 
SELECT * FROM catalog_items 
WHERE parent_key = 'admin' 
  AND is_active = TRUE
ORDER BY order_index;

-- Should show "Index Scan" in plan
```

### Post-Deployment

#### Verification Queries

```sql
-- 1. Table structure
\d catalog_items

-- 2. Index usage stats
SELECT 
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE tablename = 'catalog_items'
ORDER BY idx_scan DESC;

-- 3. Test insert with new columns
INSERT INTO catalog_items (key, type, title, icon, metadata)
VALUES ('test_migration_020', 'page', 'Test', '🧪', '{"test": true}'::jsonb);

-- Verify
SELECT * FROM catalog_items WHERE key = 'test_migration_020';

-- Cleanup test
DELETE FROM catalog_items WHERE key = 'test_migration_020';
```

#### Performance Monitoring

Monitor these metrics for 24-48 hours:

1. **Query Performance**
   - Response times for catalog queries
   - Index usage statistics

2. **Database Health**
   - Disk usage
   - Query plan changes
   - Lock contention (should be none)

3. **Application Metrics**
   - Menu load times
   - User navigation speed
   - Error rates (should be unchanged)

---

## Troubleshooting

### Issue: "column already exists"

**Cause**: Migration ran partially or was run twice without IF NOT EXISTS

**Solution**: Migration uses `IF NOT EXISTS`, so this shouldn't happen. If it does:
```sql
-- Check which columns exist
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'catalog_items' AND column_name IN ('icon', 'metadata');

-- Re-run migration (it's idempotent)
```

### Issue: "index already exists"

**Cause**: Indexes created manually or migration re-run

**Solution**: Safe to ignore. Migration uses `IF NOT EXISTS` for indexes.

### Issue: Poor query performance after migration

**Cause**: PostgreSQL query planner needs statistics update

**Solution**:
```sql
-- Update statistics
ANALYZE catalog_items;

-- Or full vacuum (if needed)
VACUUM ANALYZE catalog_items;
```

### Issue: Rollback needed

**Solution**: See [Rollback Procedure](#rollback-procedure) above.

**Important**: Back up data before rollback!
```sql
-- Export icon and metadata data
COPY (SELECT key, icon, metadata FROM catalog_items WHERE icon IS NOT NULL OR metadata IS NOT NULL)
TO '/tmp/catalog_items_backup.csv' CSV HEADER;
```

### Issue: Migration takes too long

**Cause**: Large table with millions of rows

**Solution**: Migration should be fast (< 1 second for typical sizes). For very large tables:
```sql
-- Check table size
SELECT pg_size_pretty(pg_total_relation_size('catalog_items'));

-- If > 100MB, consider:
-- 1. Run during low-traffic period
-- 2. Use CONCURRENTLY for indexes (requires separate transactions)
```

---

## References

### PostgreSQL Documentation

- [JSONB Type](https://www.postgresql.org/docs/current/datatype-json.html)
- [JSONB Operators](https://www.postgresql.org/docs/current/functions-json.html)
- [Partial Indexes](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Index Types](https://www.postgresql.org/docs/current/indexes-types.html)

### Related Migrations

- Migration 000: Baseline schema (catalog_items table creation)
- Migration 019: Inbox system support (reference for style)

### Project Documentation

- [Database Schema Documentation](../DB_MAP.md)
- [Catalog Service](../../src/services/catalog.service.js)
- [Catalog Routes](../../src/routes/admin/settings/catalog.routes.js)

---

## Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0.0 | 2025-12-31 | Initial migration |

---

## License

This migration is part of the Toinfinity ERP system.
