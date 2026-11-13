'use strict';

const authService = require('../services/auth.service');

function normalizeUser(dbUser, current = {}) {
  const displayName = [(dbUser.first_name || ''), (dbUser.last_name || '')]
    .filter(Boolean)
    .join(' ')
    .trim();

  return {
    ...current,
    id: dbUser.id,
    username: dbUser.username,
    role: dbUser.role,
    first_name: dbUser.first_name,
    last_name: dbUser.last_name,
    display_name: displayName || dbUser.display_name || current.display_name || '',
    telegram_id: dbUser.telegram_id,
    status: dbUser.status,
    active: dbUser.active,
  };
}

function isAllowedPath(pathname, allowed = []) {
  const p = (pathname || '').toLowerCase();
  return allowed.some((rule) => {
    if (!rule) return false;
    const normalized = rule.toLowerCase();
    if (normalized.endsWith('*')) {
      const prefix = normalized.slice(0, -1);
      return p.startsWith(prefix);
    }
    return p === normalized;
  });
}

async function enforceAuthFlow(req, res, next) {
  try {
    const viewer = req.session?.user || req.session?.admin || null;
    if (!viewer) return next();

    const role = String(viewer.role || '').toUpperCase();
    if (role === 'SYSTEM_ADMIN') return next();

    const username = viewer.username || viewer.user_name || null;
    if (!username) {
      if (req.session?.destroy) return req.session.destroy(() => res.redirect('/login'));
      return res.redirect('/login');
    }

    const dbUser = await authService.getUserByUsername(username);
    if (!dbUser) {
      if (req.session?.destroy) return req.session.destroy(() => res.redirect('/login'));
      return res.redirect('/login');
    }

    const path = req.path || '';
    const fullPath = `${req.baseUrl || ''}${path}`;
    const statusLower = String(dbUser.status || '').toLowerCase();

    if (statusLower === 'needs_edit') {
      return res.redirect('/register/edit');
    }

    if (!dbUser.telegram_id) {
      const allowed = [
        '/pre-register-info',
        '/auth/telegram',
        '/auth/telegram/*',
        '/logout',
        '/pending',
      ];
      if (isAllowedPath(path, allowed) || isAllowedPath(fullPath, allowed)) {
        return next();
      }
      return res.redirect('/pre-register-info');
    }

    if (statusLower === 'pending_verification' || statusLower === 'pending_telegram') {
      const allowed = ['/auth/telegram', '/auth/telegram/*', '/logout', '/pending'];
      if (isAllowedPath(path, allowed) || isAllowedPath(fullPath, allowed)) {
        return next();
      }
      return res.redirect('/auth/telegram');
    }

    if (statusLower === 'pending_manager' || dbUser.active === false) {
      const allowed = ['/pending', '/logout'];
      if (isAllowedPath(path, allowed) || isAllowedPath(fullPath, allowed)) {
        return next();
      }
      return res.redirect('/pending');
    }

    const normalizedUser = normalizeUser(dbUser, req.session?.user);
    req.session.user = normalizedUser;
    res.locals.user = normalizedUser;
    return next();
  } catch (err) {
    console.error('enforceAuthFlow error:', err?.message || err);
    return res.redirect('/login');
  }
}

module.exports = enforceAuthFlow;
