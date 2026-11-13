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

test('GET /admin/balance/debts/import renders for logged-in admin session', async () => {
  process.env.SESSION_SECRET = 'test-secret';
  process.env.DATABASE_URL = 'postgres://user:pass@localhost:5432/db';

  mockModule('connect-pg-simple', () => function memoryStoreFactory(session) {
    const Store = session.Store;
    return class MemoryStore extends Store {
      constructor() {
        super();
        this.sessions = new Map();
      }
      get(sid, cb) {
        // Return a logged-in System Admin session
        const mockSession = {
          system_admin_id: 99,
          user: { id: 99, username: 'testadmin', role: 'SYSTEM_ADMIN' }
        };
        cb(null, mockSession);
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

  mockModule(path.join(__dirname, '../../../src/config/db.js'), () => ({
    query: async (sql) => {
      // Mock System Admin authentication query
      if (sql.includes('SELECT id, username, telegram_id, is_active')) {
        return { rows: [{ id: 99, username: 'testadmin', is_active: true, locked_until: null, must_change_password: false }] };
      }
      return { rows: [] };
    },
  }));

  mockModule(path.join(__dirname, '../../../src/middlewares/auth.js'), () => ({
    getUser: (req) => req?.session?.user || null,
    isApiRequest: () => false,
    isSuperAdminUser: () => false,
    requireAuth: (req, res, next) => next(),
    requireAdmin: (req, res, next) => next(),
    requireLogin: (req, res, next) => {
      req.session = req.session || {};
      req.session.user = req.session.user || { id: 99, role: 'ADMIN' };
      res.locals.user = req.session.user;
      return next();
    },
  }));

  mockModule(path.join(__dirname, '../../../src/middlewares/guards.js'), () => ({
    enforceRole: () => (req, res, next) => next(),
    enforceStatus: (req, res, next) => next(),
  }));

  // Mock System Admin middleware to simulate authenticated session
  mockModule(path.join(__dirname, '../../../src/middlewares/systemAdmin.js'), () => ({
    adminSession: (req, res, next) => {
      req.session = req.session || {};
      req.session.system_admin_id = 99;
      req.session.user = { id: 99, username: 'testadmin', role: 'SYSTEM_ADMIN' };
      res.locals.user = req.session.user;
      next();
    },
    ADMIN_COOKIE: 'toinf_admin_sid',
    requireSystemAdmin: async (req, res, next) => {
      req.session = req.session || {};
      req.session.system_admin_id = 99;
      req.session.user = { id: 99, username: 'testadmin', role: 'SYSTEM_ADMIN' };
      req.systemAdmin = { id: 99, username: 'testadmin', is_active: true };
      res.locals.systemAdmin = req.systemAdmin;
      res.locals.user = req.session.user;
      next();
    },
  }));

  delete require.cache[require.resolve('../../../src/app')];
  const app = require('../../../src/app');

  const res = await request(app).get('/admin/balance/debts/import');
  if (res.status !== 200) {
    // eslint-disable-next-line no-console
    console.error('admin import response', res.status, (res.text || '').slice(0, 120));
  }
  assert.equal(res.status, 200);
  assert.match(res.text, /ورود بدهی با فایل/);
});
