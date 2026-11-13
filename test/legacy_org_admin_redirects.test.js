const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.SESSION_STORE = 'memory';
process.env.BYPASS_AUTH_FOR_TESTS = 'true';
process.env.BYPASS_SYSTEM_ADMIN = 'true';

const app = require('../src/app');

test('GET /org-admin/* redirects to canonical /admin/* with query preserved', async () => {
  const res = await request(app).get('/org-admin/reports?foo=bar');
  assert.equal(res.status, 301);
  assert.equal(res.headers.location, '/admin/reports?foo=bar');
});

test('POST /org-admin/* redirects with 307 to canonical /admin/*', async () => {
  const res = await request(app).post('/org-admin/definitions/users').send({ sample: true });
  assert.equal(res.status, 307);
  assert.equal(res.headers.location, '/admin/definitions/users');
});
