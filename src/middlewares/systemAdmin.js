const session = require('express-session');
const PgSession = require('connect-pg-simple')(session);
const pool = require('../config/db');

const ADMIN_COOKIE = process.env.ADMIN_SESSION_COOKIE || 'toinf_admin_sid';

const __useMemoryStore = process.env.SESSION_STORE === 'memory' || process.env.NODE_ENV === 'test';

const adminSession = session({
  store: __useMemoryStore
    ? new session.MemoryStore()
    : new PgSession({ pool, tableName: 'admin_sessions', createTableIfMissing: false }),
  name: ADMIN_COOKIE,
  secret: process.env.ADMIN_SESSION_SECRET || process.env.SESSION_SECRET || 'secret',
  resave: false,
  saveUninitialized: false,
  proxy: true,
  cookie: {
    httpOnly: true,
    secure: 'auto',
    sameSite: 'lax',
    path: '/admin',
    maxAge: 1000 * 60 * 60 * 2, // 2 hours
  },
});

async function loadSystemAdminById(id) {
  if (!id) return null;
  const q = await pool.query(
    'SELECT id, username, telegram_id, is_active, locked_until, must_change_password FROM system_admins WHERE id=$1',
    [id]
  );
  return q.rows[0] || null;
}

async function requireSystemAdmin(req, res, next) {
  try {
    if (process.env.BYPASS_SYSTEM_ADMIN === 'true') {
      const admin = req.systemAdmin || { id: 1, username: 'admin', is_active: true };
      req.session = req.session || {};
      req.session.system_admin_id = admin.id;
      req.systemAdmin = admin;
      req.session.user = { id: admin.id, username: admin.username, role: 'SYSTEM_ADMIN' };
      res.locals.systemAdmin = admin;
      res.locals.user = req.session.user;
      return next();
    }

    const adminId = req.session && req.session.system_admin_id;
    if (!adminId) return res.redirect('/admin/login');

    const admin = await loadSystemAdminById(adminId);
    if (!admin || !admin.is_active) return res.redirect('/admin/login');

    if (admin.locked_until && new Date(admin.locked_until) > new Date()) {
      return res.status(403).send('Admin account locked. Try later.');
    }

    req.systemAdmin = admin;

    // Compatibility: existing admin routes/views expect req.session.user
    req.session.user = { id: admin.id, username: admin.username, role: 'SYSTEM_ADMIN' };
    res.locals.systemAdmin = admin;
    res.locals.user = req.session.user;

    return next();
  } catch (e) {
    console.error('requireSystemAdmin error:', e);
    return res.redirect('/admin/login');
  }
}

module.exports = { adminSession, requireSystemAdmin, ADMIN_COOKIE };
