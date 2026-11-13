const { test } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const path = require('node:path');

function mockModule(specifier, factory) {
  const resolved = require.resolve(specifier, { paths: [__dirname] });
  require.cache[resolved] = {
    id: resolved,
    filename: resolved,
    loaded: true,
    exports: factory(),
  };
}

test('Admin login routes do not redirect to /login', async (t) => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

  // Mock services used during initialization
  mockModule(path.join(__dirname, '../../../src/services/catalog.service.js'), () => ({
    getEffectiveCatalogForOrgNode: async () => ({ mode: 'ADMIN', menu: [] }),
  }));

  mockModule(path.join(__dirname, '../../../src/services/reports.service.js'), () => ({
    syncReportsToDatabase: async () => [],
    listReportsFromCode: () => [],
    listActiveReports: async () => [],
    getReportWithWidgets: async () => null,
  }));

  mockModule(path.join(__dirname, '../../../src/services/license.service.js'), () => ({
    verifyLicenseOnBoot: async () => {},
  }));

  // Mock the database connection
  mockModule(path.join(__dirname, '../../../src/config/db.js'), () => ({
    query: async (sql) => {
      // Mock system_settings query for telegram bot token
      if (sql && sql.includes('system_settings')) {
        return { rows: [] };
      }
      return { rows: [] };
    },
    connect: async () => ({
      query: async () => ({ rows: [] }),
      release: () => {},
    }),
    on: () => {},
    end: async () => {},
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
  mockModule(path.join(__dirname, '../../../src/middlewares/auth.js'), () => ({
    getUser: (req) => req?.session?.user || null,
    isApiRequest: () => false,
    isSuperAdminUser: () => false,
    requireAuth: (req, res, next) => next(),
    requireAdmin: (req, res, next) => res.redirect('/admin/login'),
    requireLogin: (req, res, next) => {
      const u = (req.session && req.session.user) ? req.session.user : null;
      if (!u) return res.redirect('/login');
      res.locals.user = u;
      return next();
    },
  }));

  mockModule(path.join(__dirname, '../../../src/middlewares/guards.js'), () => ({
    enforceRole: () => (req, res, next) => next(),
    enforceStatus: (req, res, next) => next(),
  }));

  mockModule(path.join(__dirname, '../../../src/middlewares/flowGuards.js'), () => ({
    requireAuthFlow: () => (req, res, next) => next(),
    requireLoggedIn: () => (req, res, next) => next(),
    blockIfLoggedIn: () => (req, res, next) => next(),
    FLOW_STAGES: { REGISTERED: 'REGISTERED', PRE_REGISTER_OK: 'PRE_REGISTER_OK', NEED_TG_2FA: 'NEED_TG_2FA' },
    TELEGRAM_ALLOWED_STAGES: ['PRE_REGISTER_OK', 'NEED_TG_2FA'],
  }));

  // Clear cache and load app with our fix
  delete require.cache[require.resolve('../../../src/app')];
  const app = require('../../../src/app');

  await t.test('GET /admin/login returns 200 (not redirect)', async () => {
    const res = await request(app).get('/admin/login').redirects(0);
    assert.equal(res.status, 200, `Admin login page should return 200, got ${res.status}, redirect to: ${res.headers.location || 'none'}`);
    assert.match(res.text, /ورود|login/i, 'Should show login page content');
  });

  await t.test('GET /admin/dashboard redirects to /admin/login when not authenticated', async () => {
    const res = await request(app).get('/admin/dashboard');
    assert.equal(res.status, 302, 'Should redirect when not authenticated');
    assert.equal(res.headers.location, '/admin/login', 'Should redirect to /admin/login, NOT /login');
  });

  await t.test('GET /admin/definitions/teams redirects to /admin/login when not authenticated', async () => {
    const res = await request(app).get('/admin/definitions/teams');
    assert.equal(res.status, 302, 'Should redirect when not authenticated');
    assert.equal(res.headers.location, '/admin/login', 'Should redirect to /admin/login, NOT /login');
  });

  await t.test('GET /admin redirects to /admin/login when not authenticated', async () => {
    const res = await request(app).get('/admin');
    assert.equal(res.status, 302, 'Should redirect when not authenticated');
    const location = res.headers.location;
    assert.ok(
      location === '/admin/login' || location === '/admin/dashboard',
      `Should redirect to /admin/login or /admin/dashboard, got: ${location}`
    );
  });
});
