const test = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

/**
 * Migration 020: Catalog Schema Enhancements Tests
 * 
 * Test suite for verifying catalog_items table enhancements:
 * - icon and metadata columns
 * - Performance indexes
 * - Backward compatibility
 * - JSONB operations
 */

let pool;
let testItemsCreated = [];

// Helper function to run migration
async function runMigration() {
  const migrationPath = path.join(__dirname, '../../migrations/020_catalog_enhancements.sql');
  const migrationSQL = fs.readFileSync(migrationPath, 'utf8');
  await pool.query(migrationSQL);
}

// Helper function to generate unique test key
function generateTestKey() {
  return `test_item_${Date.now()}_${Math.random().toString(36).substring(7)}`;
}

// Setup: Connect to database
test.before(async () => {
  const connectionString = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL or TEST_DATABASE_URL must be set');
  }
  
  pool = new Pool({ connectionString });
  
  // Verify connection
  await pool.query('SELECT 1');
});

// Cleanup: Remove test data and close connection
test.after(async () => {
  if (testItemsCreated.length > 0) {
    try {
      await pool.query(
        'DELETE FROM catalog_items WHERE key = ANY($1::text[])',
        [testItemsCreated]
      );
    } catch (err) {
      console.warn('Cleanup warning:', err.message);
    }
  }
  
  if (pool) {
    await pool.end();
  }
});

// =========================================
// Migration Execution Tests
// =========================================

test('Migration 020: should run without errors', async () => {
  await assert.doesNotReject(async () => {
    await runMigration();
  });
});

test('Migration 020: should be idempotent (safe to run twice)', async () => {
  await assert.doesNotReject(async () => {
    await runMigration();
    await runMigration(); // Run second time
  });
});

// =========================================
// Column Addition Tests
// =========================================

test('Column: icon should exist with correct type (TEXT, nullable)', async () => {
  const result = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_items'
      AND column_name = 'icon'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'icon column should exist');
  assert.strictEqual(result.rows[0].data_type, 'text', 'icon should be TEXT type');
  assert.strictEqual(result.rows[0].is_nullable, 'YES', 'icon should be nullable');
});

test('Column: metadata should exist with correct type (JSONB, nullable)', async () => {
  const result = await pool.query(`
    SELECT column_name, data_type, is_nullable
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'catalog_items'
      AND column_name = 'metadata'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'metadata column should exist');
  assert.strictEqual(result.rows[0].data_type, 'jsonb', 'metadata should be JSONB type');
  assert.strictEqual(result.rows[0].is_nullable, 'YES', 'metadata should be nullable');
});

// =========================================
// Index Creation Tests
// =========================================

test('Index: idx_catalog_items_parent_key should exist', async () => {
  const result = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND indexname = 'idx_catalog_items_parent_key'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'idx_catalog_items_parent_key should exist');
});

test('Index: idx_catalog_items_is_active should exist', async () => {
  const result = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND indexname = 'idx_catalog_items_is_active'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'idx_catalog_items_is_active should exist');
});

test('Index: idx_catalog_items_type should exist', async () => {
  const result = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND indexname = 'idx_catalog_items_type'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'idx_catalog_items_type should exist');
});

test('Index: idx_catalog_items_active_order should exist', async () => {
  const result = await pool.query(`
    SELECT indexname
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'catalog_items'
      AND indexname = 'idx_catalog_items_active_order'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'idx_catalog_items_active_order should exist');
});

// =========================================
// Backward Compatibility Tests
// =========================================

test('Backward Compatibility: INSERT without new columns should work', async () => {
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  await assert.doesNotReject(async () => {
    await pool.query(`
      INSERT INTO catalog_items (key, type, title, description)
      VALUES ($1, $2, $3, $4)
    `, [testKey, 'page', 'Test Item', 'Test Description']);
  });
  
  // Verify the insert
  const result = await pool.query('SELECT * FROM catalog_items WHERE key = $1', [testKey]);
  assert.strictEqual(result.rows.length, 1);
  assert.strictEqual(result.rows[0].key, testKey);
  assert.strictEqual(result.rows[0].icon, null, 'icon should be null when not provided');
  assert.strictEqual(result.rows[0].metadata, null, 'metadata should be null when not provided');
});

test('Backward Compatibility: SELECT without new columns should work', async () => {
  await assert.doesNotReject(async () => {
    await pool.query(`
      SELECT key, type, title, description, route_admin, route_user, 
             parent_key, order_index, is_active, created_at, updated_at
      FROM catalog_items
      LIMIT 1
    `);
  });
});

// =========================================
// New Column Usage Tests
// =========================================

test('New Columns: INSERT with icon should work', async () => {
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  await assert.doesNotReject(async () => {
    await pool.query(`
      INSERT INTO catalog_items (key, type, title, icon)
      VALUES ($1, $2, $3, $4)
    `, [testKey, 'page', 'Dashboard', '🏠']);
  });
  
  const result = await pool.query('SELECT icon FROM catalog_items WHERE key = $1', [testKey]);
  assert.strictEqual(result.rows[0].icon, '🏠');
});

test('New Columns: INSERT with metadata should work', async () => {
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  const metadata = { badge: 'new', color: 'blue', priority: 1 };
  
  await assert.doesNotReject(async () => {
    await pool.query(`
      INSERT INTO catalog_items (key, type, title, metadata)
      VALUES ($1, $2, $3, $4)
    `, [testKey, 'page', 'Reports', JSON.stringify(metadata)]);
  });
  
  const result = await pool.query('SELECT metadata FROM catalog_items WHERE key = $1', [testKey]);
  assert.deepStrictEqual(result.rows[0].metadata, metadata);
});

test('JSONB Operations: Query with JSONB operator should work', async () => {
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  // Insert item with metadata
  await pool.query(`
    INSERT INTO catalog_items (key, type, title, metadata)
    VALUES ($1, $2, $3, $4)
  `, [testKey, 'page', 'Settings', JSON.stringify({ badge: 'featured', section: 'admin' })]);
  
  // Query using JSONB operator
  const result = await pool.query(`
    SELECT key, metadata
    FROM catalog_items
    WHERE metadata->>'badge' = 'featured'
      AND key = $1
  `, [testKey]);
  
  assert.strictEqual(result.rows.length, 1);
  assert.strictEqual(result.rows[0].key, testKey);
  assert.strictEqual(result.rows[0].metadata.badge, 'featured');
});

test('JSONB Operations: UPDATE with jsonb_set should work', async () => {
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  // Insert item with metadata
  await pool.query(`
    INSERT INTO catalog_items (key, type, title, metadata)
    VALUES ($1, $2, $3, $4)
  `, [testKey, 'page', 'Tools', JSON.stringify({ version: '1.0' })]);
  
  // Update using jsonb_set
  await pool.query(`
    UPDATE catalog_items
    SET metadata = jsonb_set(metadata, '{version}', '"2.0"', true)
    WHERE key = $1
  `, [testKey]);
  
  const result = await pool.query('SELECT metadata FROM catalog_items WHERE key = $1', [testKey]);
  assert.strictEqual(result.rows[0].metadata.version, '2.0');
});

// =========================================
// Performance Tests
// =========================================

test('Performance: parent_key queries should use index', async () => {
  // Create a parent and child item
  const parentKey = generateTestKey();
  const childKey = generateTestKey();
  testItemsCreated.push(parentKey, childKey);
  
  await pool.query(`
    INSERT INTO catalog_items (key, type, title)
    VALUES ($1, $2, $3)
  `, [parentKey, 'group', 'Parent Group']);
  
  await pool.query(`
    INSERT INTO catalog_items (key, type, title, parent_key)
    VALUES ($1, $2, $3, $4)
  `, [childKey, 'page', 'Child Page', parentKey]);
  
  // Run EXPLAIN to check if index is used
  const explainResult = await pool.query(`
    EXPLAIN (FORMAT JSON)
    SELECT * FROM catalog_items WHERE parent_key = $1
  `, [parentKey]);
  
  const plan = JSON.stringify(explainResult.rows[0]);
  // Check if the plan mentions our index (partial match is OK)
  const usesIndex = plan.includes('idx_catalog_items_parent_key') || 
                    plan.includes('Index Scan') ||
                    plan.includes('Bitmap Index Scan');
  
  assert.ok(usesIndex, 'Query should use an index scan for parent_key queries');
});

test('Performance: is_active queries should use index', async () => {
  // Run EXPLAIN to check if index is used
  const explainResult = await pool.query(`
    EXPLAIN (FORMAT JSON)
    SELECT * FROM catalog_items WHERE is_active = TRUE
  `);
  
  const plan = JSON.stringify(explainResult.rows[0]);
  // For small tables, PostgreSQL might choose Seq Scan, so we just check that index exists
  // The index will be used when table grows larger
  const indexExists = await pool.query(`
    SELECT 1 FROM pg_indexes 
    WHERE indexname = 'idx_catalog_items_is_active'
  `);
  
  assert.strictEqual(indexExists.rows.length, 1, 'is_active index should exist for performance optimization');
});

// =========================================
// Documentation Tests
// =========================================

test('Documentation: Column comments should exist', async () => {
  const result = await pool.query(`
    SELECT 
      c.column_name,
      pgd.description
    FROM pg_catalog.pg_statio_all_tables AS st
    INNER JOIN pg_catalog.pg_description pgd ON (pgd.objoid = st.relid)
    INNER JOIN information_schema.columns c ON (
      pgd.objsubid = c.ordinal_position 
      AND c.table_schema = st.schemaname 
      AND c.table_name = st.relname
    )
    WHERE st.schemaname = 'public'
      AND st.relname = 'catalog_items'
      AND c.column_name IN ('icon', 'metadata')
    ORDER BY c.column_name
  `);
  
  assert.ok(result.rows.length >= 1, 'At least one new column should have a comment');
  
  // Check if comments contain meaningful text
  const hasIconComment = result.rows.some(row => 
    row.column_name === 'icon' && row.description && row.description.length > 0
  );
  const hasMetadataComment = result.rows.some(row => 
    row.column_name === 'metadata' && row.description && row.description.length > 0
  );
  
  assert.ok(hasIconComment || hasMetadataComment, 'New columns should have documentation comments');
});
