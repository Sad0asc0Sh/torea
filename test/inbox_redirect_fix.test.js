const assert = require('node:assert/strict');
const { test } = require('node:test');
const request = require('supertest');

process.env.NODE_ENV = 'test';
process.env.SESSION_STORE = 'memory';
process.env.BYPASS_AUTH_FOR_TESTS = 'true';
process.env.BYPASS_SYSTEM_ADMIN = 'true';

const app = require('../src/app');

test('GET /admin/inbox does not redirect to /user/inbox (no loop)', async () => {
  const res = await request(app).get('/admin/inbox');
  // Should either render the page (200) or redirect elsewhere, but NOT to /user/inbox
  if (res.status === 301 || res.status === 302 || res.status === 307) {
    assert.notEqual(res.headers.location, '/user/inbox', 'Should not redirect to /user/inbox');
    // Also check for any location that would create a loop
    assert.match(res.headers.location || '', /^(?!\/user\/inbox)/, 'Should not redirect to /user/inbox');
  }
  // We expect either 200 (success) or some other response, but not a redirect to /user/inbox
  assert.ok([200, 401, 403, 404, 500].includes(res.status) || 
           (res.status >= 300 && res.status < 400 && res.headers.location !== '/user/inbox'),
           'Should not create redirect loop to /user/inbox');
});

test('GET /user/inbox redirects to /admin/inbox (legacy path)', async () => {
  const res = await request(app).get('/user/inbox');
  assert.equal(res.status, 301, 'Should redirect with 301');
  assert.equal(res.headers.location, '/admin/inbox', 'Should redirect to /admin/inbox');
});

test('GET /user/inbox with query string preserves query in redirect', async () => {
  const res = await request(app).get('/user/inbox?category=credit');
  assert.equal(res.status, 301, 'Should redirect with 301');
  assert.equal(res.headers.location, '/admin/inbox?category=credit', 'Should preserve query string');
});
