'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

test('auth service SQL uses lower(trim(username)) and trims parameter ($1) too', () => {
  const svcPath = path.join(process.cwd(), 'src/services/auth.service.js');
  assert.ok(fs.existsSync(svcPath), 'auth.service.js not found');

  const src = fs.readFileSync(svcPath, 'utf8');

  // must be SELECT from users (basic sanity)
  assert.ok(/SELECT\s+\*\s+FROM\s+users/i.test(src), 'expected SELECT * FROM users in auth.service.js');

  // must be case-insensitive and trim username column
  assert.ok(/lower\(trim\(username\)\)/i.test(src), 'expected lower(trim(username)) in auth.service.js');

  // must trim the parameter too: lower(trim($1))
  assert.ok(/lower\(trim\(\$1\)\)/i.test(src), 'expected lower(trim($1)) in auth.service.js');
});
