'use strict';

/**
 * Minimal SQL migration runner for this repo.
 *
 * Source of truth for a fresh install is migrations/000_baseline.sql
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/db_migrate.js
 *   DATABASE_URL=postgres://... node scripts/db_migrate.js --mark-applied
 */

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Client } = require('pg');

const MIGRATIONS_DIR = path.join(__dirname, '..', 'migrations');

function die(msg) {
  console.error('\n❌ ' + msg + '\n');
  process.exit(1);
}

function ok(msg) {
  console.log('✅ ' + msg);
}

function info(msg) {
  console.log('ℹ️  ' + msg);
}

function normalizeForHash(s) {
  return String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function sha256(s) {
  return crypto.createHash('sha256').update(normalizeForHash(s), 'utf8').digest('hex');
}

function parseArgs(argv) {
  const args = { markApplied: false };
  for (const a of argv.slice(2)) {
    if (a === '--mark-applied' || a === '--mark_applied') args.markApplied = true;
  }
  return args;
}

function listSqlMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) die(`Migrations directory not found: ${MIGRATIONS_DIR}`);
  const files = fs.readdirSync(MIGRATIONS_DIR)
    .filter(f => f.toLowerCase().endsWith('.sql'))
    .filter(f => !f.startsWith('.'))
    .sort((a, b) => a.localeCompare(b, 'en'));

  if (!files.length) die('No .sql files found in migrations/.');
  return files.map(f => ({
    filename: f,
    fullpath: path.join(MIGRATIONS_DIR, f),
  }));
}

async function ensureSchemaMigrationsTable(client) {
  await client.query(`
    CREATE TABLE IF NOT EXISTS public.schema_migrations (
      id BIGSERIAL PRIMARY KEY,
      filename TEXT NOT NULL UNIQUE,
      checksum TEXT NOT NULL,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

async function loadApplied(client) {
  const { rows } = await client.query('SELECT filename, checksum FROM public.schema_migrations ORDER BY filename;');
  const map = new Map();
  for (const r of rows) map.set(r.filename, r.checksum);
  return map;
}

async function markApplied(client, filename, checksum) {
  await client.query(
    'INSERT INTO public.schema_migrations(filename, checksum) VALUES ($1, $2) ON CONFLICT (filename) DO NOTHING;',
    [filename, checksum]
  );
}

async function applyMigration(client, filename, sqlText, checksum) {
  await client.query('BEGIN;');
  try {
    // Execute the SQL (multi-statement supported because there are no parameters)
    await client.query(sqlText);
    await client.query(
      'INSERT INTO public.schema_migrations(filename, checksum) VALUES ($1, $2);',
      [filename, checksum]
    );
    await client.query('COMMIT;');
  } catch (err) {
    try { await client.query('ROLLBACK;'); } catch (_) {}

    // Add a helpful hint for common permission issue
    const msg = String(err && err.message ? err.message : err);
    if (/permission denied/i.test(msg) && /extension/i.test(msg)) {
      throw new Error(
        msg +
        '\n\nHint: this baseline uses pgcrypto. If your DB user cannot CREATE EXTENSION, enable it as a superuser first, e.g.:' +
        "\n  sudo -u postgres psql <db_name> -c \"CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;\"\n"
      );
    }

    throw err;
  }
}

async function main() {
  const { markApplied: onlyMark } = parseArgs(process.argv);
  const dbUrl = process.env.DATABASE_URL;

  if (!dbUrl) {
    die('DATABASE_URL is not set. Put it in .env or export it in your shell/PM2 env.');
  }
  if (!/^postgres(ql)?:\/\//i.test(dbUrl)) {
    die('DATABASE_URL must start with postgres:// or postgresql://');
  }

  const migrations = listSqlMigrations();
  info(`Found ${migrations.length} migration(s) in migrations/: ${migrations.map(m => m.filename).join(', ')}`);
  if (onlyMark) info('Running in MARK-APPLIED mode (no SQL will be executed).');

  const client = new Client({ connectionString: dbUrl });
  await client.connect();

  try {
    await ensureSchemaMigrationsTable(client);
    const applied = await loadApplied(client);

    for (const m of migrations) {
      const sql = fs.readFileSync(m.fullpath, 'utf8');
      const checksum = sha256(sql);

      if (applied.has(m.filename)) {
        const existing = applied.get(m.filename);
        if (existing !== checksum) {
          die(
            `Checksum mismatch for already-applied migration: ${m.filename}\n` +
            `DB checksum:   ${existing}\n` +
            `File checksum: ${checksum}\n\n` +
            'This means the migration file was modified after it was applied. Restore the original file or create a new migration.'
          );
        }
        ok(`Already applied: ${m.filename}`);
        continue;
      }

      if (onlyMark) {
        await markApplied(client, m.filename, checksum);
        ok(`Marked as applied: ${m.filename}`);
      } else {
        info(`Applying: ${m.filename} ...`);
        await applyMigration(client, m.filename, sql, checksum);
        ok(`Applied: ${m.filename}`);
      }
    }

    ok('Database migrations are up to date.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('\n❌ Migration failed:\n');
  console.error(err && err.stack ? err.stack : err);
  process.exit(1);
});
