const assert = require('node:assert/strict');
const { test, mock, beforeEach, afterEach } = require('node:test');
const request = require('supertest');
const express = require('express');
const session = require('express-session');
const path = require('node:path');

test('authentication redirect fix - unified session for /admin routes', async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypassAuth = process.env.BYPASS_AUTH_FOR_TESTS;
  process.env.NODE_ENV = 'test';
  process.env.BYPASS_AUTH_FOR_TESTS = 'false';
  process.env.SESSION_STORE = 'memory';

  // Clear module cache to get fresh app
  delete require.cache[require.resolve('../src/app.js')];
  delete require.cache[require.resolve('../src/middlewares/auth.js')];
  
  const app = require('../src/app.js');

  await t.test('unauthenticated request to /admin/dashboard redirects to /login', async () => {
    const res = await request(app).get('/admin/dashboard');
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/login');
  });

  await t.test('unauthenticated request to /admin redirects to /login', async () => {
    const res = await request(app).get('/admin');
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/login');
  });

  await t.test('GET /admin/login returns 200 (system admin login page)', async () => {
    const res = await request(app).get('/admin/login');
    assert.strictEqual(res.statusCode, 200);
  });

  await t.test('GET /login returns 200 (user login page)', async () => {
    const res = await request(app).get('/login');
    assert.strictEqual(res.statusCode, 200);
  });

  await t.test('wrong password on /login stays on /login with error', async () => {
    // Mock auth service to return a user
    const authService = require('../src/services/auth.service');
    const getUserByUsernameStub = mock.method(authService, 'getUserByUsername', async () => ({
      id: 1,
      username: 'testuser',
      password_hash: '$2a$10$invalidhash',
      status: 'active',
      active: true,
      role: 'USER',
    }));
    const getSystemSettingStub = mock.method(authService, 'getSystemSetting', async () => 'telegram-token');

    const res = await request(app)
      .post('/login')
      .send({ username: 'testuser', password: 'wrongpassword' })
      .set('Content-Type', 'application/x-www-form-urlencoded');

    // Should render login page with error, NOT redirect to /admin/login
    assert.strictEqual(res.statusCode, 200);
    assert.match(res.text, /نام کاربری یا رمز عبور اشتباه است/);
    assert.doesNotMatch(res.text, /ورود ادمین سیستم/); // Should not be system admin login

    getUserByUsernameStub.mock.restore();
    getSystemSettingStub.mock.restore();
  });

  await t.test('/admin/logout without session redirects to /login (not /admin/login)', async () => {
    const res = await request(app).get('/admin/logout');
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/login');
  });

  // Restore environment
  process.env.NODE_ENV = originalNodeEnv;
  process.env.BYPASS_AUTH_FOR_TESTS = originalBypassAuth;
});

test('system admin routes remain separate', async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.BYPASS_AUTH_FOR_TESTS = 'false';
  process.env.SESSION_STORE = 'memory';

  delete require.cache[require.resolve('../src/app.js')];
  const app = require('../src/app.js');

  await t.test('/admin/login uses separate adminSession', async () => {
    const res = await request(app).get('/admin/login');
    assert.strictEqual(res.statusCode, 200);
    // Check that we get the system admin login page
    assert.match(res.text, /ورود ادمین سیستم|پنل ادمین سیستم/);
  });

  await t.test('/admin/verify requires pending admin session', async () => {
    const res = await request(app).get('/admin/verify');
    // Should redirect to /admin/login if no pending session
    assert.strictEqual(res.statusCode, 302);
    assert.strictEqual(res.headers.location, '/admin/login');
  });

  process.env.NODE_ENV = originalNodeEnv;
});

test('authenticated normal user can access /admin UI', async (t) => {
  const originalNodeEnv = process.env.NODE_ENV;
  const originalBypassAuth = process.env.BYPASS_AUTH_FOR_TESTS;
  process.env.NODE_ENV = 'test';
  process.env.BYPASS_AUTH_FOR_TESTS = 'true'; // Bypass auth to simulate logged-in user
  process.env.SESSION_STORE = 'memory';

  delete require.cache[require.resolve('../src/app.js')];
  delete require.cache[require.resolve('../src/middlewares/auth.js')];
  const app = require('../src/app.js');

  await t.test('authenticated user can access /admin/dashboard', async () => {
    const agent = request.agent(app);
    
    // Simulate logged-in user by setting session
    const res = await agent.get('/admin/dashboard');
    
    // Should render dashboard (200) or redirect to catalog-restricted page
    // but NOT redirect to /admin/login
    assert.ok(
      res.statusCode === 200 || (res.statusCode === 302 && res.headers.location !== '/admin/login'),
      `Expected 200 or redirect (not to /admin/login), got ${res.statusCode} with location: ${res.headers.location}`
    );
  });

  process.env.NODE_ENV = originalNodeEnv;
  process.env.BYPASS_AUTH_FOR_TESTS = originalBypassAuth;
});

