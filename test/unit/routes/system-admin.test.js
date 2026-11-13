const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('node:path');

function mockModule(specifier, factory) {
  const resolved = require.resolve(specifier, { paths: [path.join(__dirname, '..')] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: factory(),
  };
}

test('Root /admin route handler redirects correctly', async (t) => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

  // Mock the database connection
  mockModule(path.join(__dirname, '..', 'config/db.js'), () => ({
    query: async () => ({ rows: [] }),
  }));

  // Mock connect-pg-simple to use memory store
  mockModule('connect-pg-simple', () => function memoryStoreFactory(session) {
    const Store = session.Store;
    return class MemoryStore extends Store {
      constructor() {
        super();
        this.sessions = new Map();
      }
      get(sid, cb) {
        cb(null, this.sessions.get(sid) || null);
      }
      set(sid, sess, cb) {
        this.sessions.set(sid, sess);
        if (cb) cb();
      }
      destroy(sid, cb) {
        this.sessions.delete(sid);
        if (cb) cb();
      }
    };
  });

  // Mock legacy auth middleware
  mockModule(path.join(__dirname, '..', 'middlewares/auth.js'), () => ({
    getUser: (req) => req?.session?.user || null,
    isApiRequest: () => false,
    isSuperAdminUser: () => false,
    requireAuth: (req, res, next) => next(),
    requireAdmin: (req, res, next) => next(),
    requireLogin: (req, res, next) => next(),
  }));

  mockModule(path.join(__dirname, '..', 'middlewares/guards.js'), () => ({
    enforceRole: () => (req, res, next) => next(),
    enforceStatus: (req, res, next) => next(),
  }));

  // Clear cache and load app
  delete require.cache[require.resolve('../app')];
  const app = require('../app');

  await t.test('GET /admin without authentication redirects to /admin/login', async () => {
    const res = await request(app).get('/admin');
    assert.equal(res.status, 302, 'Should redirect');
    assert.equal(res.headers.location, '/admin/login', 'Should redirect to /admin/login');
  });

  await t.test('GET /admin with trailing slash without authentication redirects to /admin/login', async () => {
    const res = await request(app).get('/admin/');
    assert.equal(res.status, 302, 'Should redirect');
    assert.equal(res.headers.location, '/admin/login', 'Should redirect to /admin/login');
  });

  await t.test('Existing /admin/login route still works', async () => {
    const res = await request(app).get('/admin/login');
    assert.equal(res.status, 200, 'Login page should be accessible');
  });

  await t.test('Existing /admin/dashboard route redirects when not authenticated', async () => {
    const res = await request(app).get('/admin/dashboard');
    assert.equal(res.status, 302, 'Should redirect when not authenticated');
    assert.equal(res.headers.location, '/admin/login', 'Should redirect to /admin/login');
  });
});
