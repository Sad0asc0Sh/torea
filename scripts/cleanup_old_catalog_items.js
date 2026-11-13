#!/usr/bin/env node

/**
 * Cleanup deprecated catalog items and duplicates.
 * Usage:
 *   node scripts/cleanup_old_catalog_items.js --dry-run  (no DB changes)
 *   node scripts/cleanup_old_catalog_items.js            (apply changes)
 */

'use strict';

const path = require('path');
const projectRoot = path.resolve(__dirname, '..');
const pool = require(path.join(projectRoot, 'src', 'config', 'db'));
// Keep deprecated routes aligned with catalog discovery logic.
const DEPRECATED_CATALOG_ROUTES = require('../src/config/deprecatedCatalogRoutes');

const DRY_RUN = process.argv.includes('--dry-run');
const DEPRECATED_ROUTE_PATTERNS = DEPRECATED_CATALOG_ROUTES.map((route) => `${route.toLowerCase()}%`);
const DEPRECATED_KEY_PATTERNS = Array.from(
  new Set(
    DEPRECATED_CATALOG_ROUTES.map((route) => {
      const dotted = route.replace(/^\/+/, '').replace(/\//g, '.').toLowerCase();
      return dotted.startsWith('admin.') ? dotted : `admin.${dotted}`;
    })
  )
).map((key) => `${key}%`);

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    console.log(`🧹 Catalog cleanup started (${DRY_RUN ? 'dry-run' : 'apply'})`);

    // 1) Detect duplicates by route_admin
    const dupes = await client.query(`
      SELECT 
        route_admin,
        COUNT(*) AS count,
        ARRAY_AGG(key ORDER BY created_at NULLS LAST, key) AS keys
      FROM catalog_items
      WHERE route_admin IS NOT NULL
      GROUP BY route_admin
      HAVING COUNT(*) > 1
    `);

    if (dupes.rowCount > 0) {
      console.log('🔎 Duplicate routes detected:');
      dupes.rows.forEach((row) => {
        console.log(`  • ${row.route_admin}: ${row.keys.join(', ')}`);
      });
    } else {
      console.log('✅ No duplicate routes found.');
    }

    // 2) Deactivate duplicates (keep the first key per route)
    // Prefer the earliest created_at; if null, fall back to key ordering for deterministic deactivation.
    const deactivateDupes = await client.query(`
      WITH ranked AS (
        SELECT 
          key,
          route_admin,
          ROW_NUMBER() OVER (
            PARTITION BY route_admin 
            ORDER BY created_at NULLS LAST, key
          ) AS rn
        FROM catalog_items
        WHERE route_admin IS NOT NULL
      )
      UPDATE catalog_items c
      SET is_active = FALSE, updated_at = NOW()
      FROM ranked r
      WHERE c.key = r.key
        AND r.rn > 1
        AND c.is_active = TRUE
      RETURNING c.key, c.route_admin
    `);
    console.log(`➡️  Deactivated duplicate items: ${deactivateDupes.rowCount}`);

    // 3) Deactivate deprecated catalog routes
    const deprecated = await client.query(`
      UPDATE catalog_items
      SET is_active = FALSE, updated_at = NOW()
      WHERE is_active = TRUE AND (
        LOWER(key) LIKE ANY($1::text[]) OR
        LOWER(COALESCE(route_admin, '')) LIKE ANY($2::text[])
      )
      RETURNING key
    `, [DEPRECATED_KEY_PATTERNS, DEPRECATED_ROUTE_PATTERNS]);
    console.log(`➡️  Deactivated deprecated items: ${deprecated.rowCount}`);

    // 4) Final stats
    const stats = await client.query(`
      SELECT 
        COUNT(*) FILTER (WHERE is_active) AS active,
        COUNT(*) FILTER (WHERE NOT is_active) AS inactive
      FROM catalog_items
    `);
    console.log(`📊 Active: ${stats.rows[0].active}, Inactive: ${stats.rows[0].inactive}`);

    if (DRY_RUN) {
      await client.query('ROLLBACK');
      console.log('ℹ️  Dry-run complete. No changes were committed.');
    } else {
      await client.query('COMMIT');
      console.log('✅ Cleanup committed successfully.');
    }
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('❌ Cleanup failed, rolled back:', err.message || err);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main();
