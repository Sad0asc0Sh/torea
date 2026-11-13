const test = require('node:test');
const assert = require('node:assert');
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');
const { VALID_CATALOG_TYPES } = require('../../src/config/catalogConstants');

/**
 * Migration 022: Fix catalog_items Schema Tests
 * 
 * Test suite for verifying schema fixes:
 * - type column NOT NULL constraint
 * - CHECK constraint for type values
 * - FK constraint for parent_key
 * - Trigger for updated_at
 */

let pool;
let testItemsCreated = [];

// Helper function to run migration
async function runMigration() {
  const migrationPath = path.join(__dirname, '../../migrations/022_fix_catalog_items_schema.sql');
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

test('Migration 022: Can run idempotently', async () => {
  // Should not throw error when run multiple times
  await assert.doesNotReject(async () => {
    await runMigration();
    await runMigration(); // Run again
  });
});

test('Migration 022: type column is NOT NULL', async () => {
  await runMigration();
  
  const result = await pool.query(`
    SELECT is_nullable
    FROM information_schema.columns
    WHERE table_name = 'catalog_items' 
      AND column_name = 'type'
  `);
  
  assert.strictEqual(result.rows[0].is_nullable, 'NO', 'type column should be NOT NULL');
});

test('Migration 022: CHECK constraint exists for type', async () => {
  await runMigration();
  
  const result = await pool.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.catalog_items'::regclass
      AND conname = 'catalog_items_type_check'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'CHECK constraint should exist');
});

test('Migration 022: FK constraint exists for parent_key', async () => {
  await runMigration();
  
  const result = await pool.query(`
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.catalog_items'::regclass
      AND conname = 'catalog_items_parent_fk'
  `);
  
  assert.strictEqual(result.rows.length, 1, 'FK constraint should exist');
});

test('Migration 022: Invalid type value is rejected', async () => {
  await runMigration();
  
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  await assert.rejects(
    async () => {
      await pool.query(
        'INSERT INTO catalog_items (key, type, title) VALUES ($1, $2, $3)',
        [testKey, 'invalid_type', 'Test Item']
      );
    },
    /violates check constraint/,
    'Should reject invalid type value'
  );
});

test('Migration 022: Valid type values are accepted', async () => {
  await runMigration();
  
  for (const type of VALID_CATALOG_TYPES) {
    const testKey = generateTestKey();
    testItemsCreated.push(testKey);
    
    await assert.doesNotReject(
      async () => {
        await pool.query(
          'INSERT INTO catalog_items (key, type, title) VALUES ($1, $2, $3)',
          [testKey, type, `Test ${type}`]
        );
      },
      `Should accept type: ${type}`
    );
  }
});

test('Migration 022: NULL type value is rejected', async () => {
  await runMigration();
  
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  await assert.rejects(
    async () => {
      await pool.query(
        'INSERT INTO catalog_items (key, type, title) VALUES ($1, $2, $3)',
        [testKey, null, 'Test Item']
      );
    },
    /null value in column "type"/,
    'Should reject NULL type value'
  );
});

test('Migration 022: Trigger updates updated_at on modification', async () => {
  await runMigration();
  
  const testKey = generateTestKey();
  testItemsCreated.push(testKey);
  
  // Insert item
  await pool.query(
    'INSERT INTO catalog_items (key, type, title) VALUES ($1, $2, $3)',
    [testKey, 'page', 'Test Item']
  );
  
  // Get initial updated_at
  const initial = await pool.query(
    'SELECT updated_at FROM catalog_items WHERE key = $1',
    [testKey]
  );
  const initialTime = initial.rows[0].updated_at;
  
  // Wait a bit to ensure time difference
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Update item
  await pool.query(
    'UPDATE catalog_items SET title = $1 WHERE key = $2',
    ['Updated Title', testKey]
  );
  
  // Get new updated_at
  const updated = await pool.query(
    'SELECT updated_at FROM catalog_items WHERE key = $1',
    [testKey]
  );
  const updatedTime = updated.rows[0].updated_at;
  
  assert.ok(
    new Date(updatedTime) > new Date(initialTime),
    'updated_at should be updated by trigger'
  );
});

test('Migration 022: Parent FK constraint works correctly', async () => {
  await runMigration();
  
  const parentKey = generateTestKey();
  const childKey = generateTestKey();
  testItemsCreated.push(parentKey, childKey);
  
  // Insert parent
  await pool.query(
    'INSERT INTO catalog_items (key, type, title) VALUES ($1, $2, $3)',
    [parentKey, 'group', 'Parent Item']
  );
  
  // Insert child with valid parent
  await assert.doesNotReject(
    async () => {
      await pool.query(
        'INSERT INTO catalog_items (key, type, title, parent_key) VALUES ($1, $2, $3, $4)',
        [childKey, 'page', 'Child Item', parentKey]
      );
    },
    'Should accept valid parent_key'
  );
  
  // Try to insert with invalid parent
  const invalidChildKey = generateTestKey();
  testItemsCreated.push(invalidChildKey);
  
  await assert.rejects(
    async () => {
      await pool.query(
        'INSERT INTO catalog_items (key, type, title, parent_key) VALUES ($1, $2, $3, $4)',
        [invalidChildKey, 'page', 'Invalid Child', 'nonexistent_parent']
      );
    },
    /violates foreign key constraint/,
    'Should reject invalid parent_key'
  );
});
