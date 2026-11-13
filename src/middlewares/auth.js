function getUser(req) {
  return (req.session && req.session.user) ? req.session.user : null;
}

function isApiRequest(req) {
  const accept = String(req?.headers?.accept || '').toLowerCase();
  const xhr = !!req?.xhr;
  const requestedWith = String(req?.headers?.['x-requested-with'] || '').toLowerCase();
  const wantsJson = accept.includes('json') || requestedWith === 'xmlhttprequest';
  const isApiPath = !!req?.originalUrl && req.originalUrl.startsWith('/api');
  return xhr || wantsJson || isApiPath;
}

function isAdminPath(req) {
  const base = req.baseUrl || '';
  if (base.startsWith('/admin')) return true;
  const path = req.path || '';
  if (path.startsWith('/admin')) return true;
  const original = req.originalUrl || '';
  return original.startsWith('/admin');
}

function isSystemAdminAuthPath(req) {
  // System admin authentication pages only (not general /admin UI)
  const path = req.path || '';
  const base = req.baseUrl || '';
  const fullPath = (base + path).toLowerCase();
  return /^\/admin\/(login|verify|first-setup|reset|register|logout)/.test(fullPath);
}

function requireLogin(req, res, next) {
  const bypassAuth = process.env.BYPASS_AUTH_FOR_TESTS === 'true';
  if (bypassAuth) {
    const u = req.session?.user || { id: 1, username: 'test', role: 'SYSTEM_ADMIN' };
    req.session = req.session || {};
    req.session.user = u;
    res.locals.user = u;
    return next();
  }

  const viewer = req.session?.user || req.session?.admin || null;

  if (!viewer) {
    if (isApiRequest(req)) return res.status(401).json({ error: 'unauthorized' });
    // All unauthenticated requests redirect to user login (/login)
    // System admin uses separate auth flow via /admin/login (not protected by requireLogin)
    return res.redirect('/login');
  }

  const session = req.session || (req.session = {});
  if (!session.user) session.user = viewer;
  req.user = session.user;
  res.locals = res.locals || {};
  res.locals.user = session.user;
  return next();
}

// سازگاری با جاهای قبلی
const requireAuth = requireLogin;

// فقط سوپرادمین‌ها (و یوزرنیم admin) مجازند
function isSuperAdminUser(u) {
  if (!u) return false;
  if (u.username === 'admin') return true;
  const role = String(u.role || '').toUpperCase();
  return role === 'SUPER_ADMIN' || role === 'SYSTEM_ADMIN';
}

// برای سازگاری: requireAdmin = فقط سوپرادمین
const isAdminUser = isSuperAdminUser;

function requireAdmin(req, res, next) {
  // Legacy: admin roles removed from users. Only System Admin can access /admin via /admin/login.
  return res.redirect('/admin/login');
}

module.exports = { getUser, isApiRequest, requireAuth, requireLogin, isAdminUser, isSuperAdminUser, requireAdmin };
