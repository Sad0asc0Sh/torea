const pool = require('../config/db');
const { requireLogin, isApiRequest } = require('./auth');

function normalizeUserSession(current, dbUser) {
  const activeRaw = dbUser?.active;
  const activeStr = typeof activeRaw === 'string' ? activeRaw.toLowerCase() : '';
  const active =
    activeRaw === true ||
    activeRaw === 1 ||
    activeStr === 'true' ||
    activeStr === 't';

  return {
    ...(current || {}),
    ...(dbUser || {}),
    active,
    status: dbUser?.status || null,
  };
}

async function enforceStatus(req, res, next) {
  const user = req.session?.user || null;
  if (!user) return requireLogin(req, res, next);

  res.locals.user = res.locals.user || user;

  const role = String(user.role || '').toUpperCase();
  if (role === 'SYSTEM_ADMIN') return next();

  const userId = user.id;
  if (!userId) {
    return requireLogin(req, res, next);
  }

  let dbUser = null;
  try {
    const q = await pool.query(
      'SELECT id, username, role, status, active, first_name, last_name FROM users WHERE id=$1',
      [userId]
    );
    dbUser = q.rows[0] || null;
  } catch (e) {
    console.error('enforceStatus load user error:', e);
    if (isApiRequest(req)) return res.status(500).json({ error: 'internal_error' });
    return res.redirect('/login');
  }

  if (!dbUser) {
    if (isApiRequest(req)) {
      if (req.session?.destroy) req.session.destroy(() => {});
      return res.status(401).json({ error: 'unauthorized' });
    }
    if (req.session?.destroy) {
      return req.session.destroy((err) => {
        if (err) console.error('enforceStatus destroy session error:', err);
        return res.redirect('/login');
      });
    }
    return res.redirect('/login');
  }

  const normalizedUser = normalizeUserSession(user, dbUser);
  res.locals.user = normalizedUser;

  const status = String(dbUser.status || '').toLowerCase();
  const isPending = status.startsWith('pending');
  const isRejected = status === 'rejected';
  const isInactive = !normalizedUser.active;

  if (isPending || isRejected || isInactive) {
    if (isApiRequest(req)) return res.status(403).json({ error: 'account_not_active' });
    return res.redirect('/pending');
  }

  req.session.user = normalizedUser;
  return next();
}

// Ensure user is approved before accessing routes
function ensureApproved(req, res, next) {
  const user = req.session?.user || req.session?.admin || null;
  if (!user) return requireLogin(req, res, next);
  
  const role = String(user.role || '').toUpperCase();
  // System admins are always approved
  if (role === 'SYSTEM_ADMIN') return next();
  
  const status = String(user.status || '').toLowerCase();
  const isApproved = status === 'approved' || status === 'active';
  
  if (!isApproved) {
    if (isApiRequest(req)) return res.status(403).json({ error: 'account_not_approved' });
    return res.status(403).render('auth/pending', { user });
  }
  
  return next();
}

module.exports = { enforceStatus, ensureApproved };
