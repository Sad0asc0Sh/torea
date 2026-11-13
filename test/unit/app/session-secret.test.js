'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');

const appPath = path.join(process.cwd(), 'src', 'app.js');

function buildEnv(overrides = {}) {
  const env = { ...process.env };
  env.DATABASE_URL = process.env.DATABASE_URL || 'postgres://example.invalid/testdb';
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete env[key];
    } else {
      env[key] = value;
    }
  }
  return env;
}

test('fails fast in production when SESSION_SECRET is missing', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(appPath)})`],
    {
      cwd: process.cwd(),
      env: buildEnv({ NODE_ENV: 'production', SESSION_SECRET: undefined }),
      encoding: 'utf8',
    }
  );

  assert.strictEqual(result.status, 1);
  assert.match(result.stderr || '', /SESSION_SECRET/);
});

test('initializes in non-production without SESSION_SECRET', () => {
  const result = spawnSync(
    process.execPath,
    ['-e', `require(${JSON.stringify(appPath)})`],
    {
      cwd: process.cwd(),
      env: buildEnv({ NODE_ENV: 'test', SESSION_SECRET: undefined }),
      encoding: 'utf8',
    }
  );

  assert.strictEqual(result.status, 0);
  assert.strictEqual(result.error, undefined);
});
