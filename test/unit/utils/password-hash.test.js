'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const bcrypt = require('bcryptjs');

test('bcryptjs hashes and compares passwords correctly', async () => {
  const password = 'pa55w0rd!';
  const hash = await bcrypt.hash(password, 10);

  assert.notStrictEqual(hash, password);
  assert.strictEqual(await bcrypt.compare(password, hash), true);
  assert.strictEqual(await bcrypt.compare('wrong-password', hash), false);
});
