'use strict';
const { normalizeRoute, matchesRoute } = require('../utils/catalogRoutes');
const { getEffectiveCatalogForOrgNode } = require('../services/catalog.service');
let getCatalogEffective = getEffectiveCatalogForOrgNode;

function computeRouteSets(effective, preferAdminRoutes, options = {}) {
  const bypass = options.bypass === true;
  const allowed = new Set();
  const known = new Set();
  const effectiveAllowed = Array.isArray(effective?.allowedRoutes)
    ? effective.allowedRoutes
    : (effective?.flat || []).map((n) => n.href).filter(Boolean);
  const normalizedAllowed = effectiveAllowed.map((r) => normalizeRoute(r));
  const routeList =
    preferAdminRoutes && effective?.routes ? effective.routes.admin : effective?.routes?.user;
  (routeList || []).forEach((route) => {
    if (route) known.add(normalizeRoute(route));
  });
  
  // 🔒 Security Fix #2: Only use bypass flag (System Admin only)
  // Do NOT honor effective.mode='ADMIN' for org_nodes
  if (bypass) {
    normalizedAllowed.forEach((r) => allowed.add(r));
    known.forEach((r) => allowed.add(r));
    return { allowed, known };
  }
  
  // Regular users: only explicitly allowed routes
  normalizedAllowed.forEach((r) => allowed.add(r));
  return { allowed, known };
}

function createCatalogAccessMiddleware(options = {}) {
  const preferAdminRoutes = options.preferAdminRoutes;
  const enforceAccess = options.enforce === true;

  return async function catalogAccess(req, res, next) {
    const user = req.session?.user || null;
    const orgNodeId = user?.org_node_id || null;
    const userRole = String(user?.role || '').toUpperCase();
    const isSystemAdmin = userRole === 'SYSTEM_ADMIN';
    res.locals.__catalogBypass = isSystemAdmin === true;

    const useAdminRoutes =
      typeof preferAdminRoutes === 'boolean'
        ? preferAdminRoutes
        : (req.baseUrl || req.path || '').startsWith('/admin');

    // System Admin → Full bypass
    if (isSystemAdmin) {
      req.orgCatalogMode = 'ADMIN';
      req.orgAdminMode = true;
      res.locals.__catalogEffective = null;
      res.locals.__catalogMode = 'ADMIN';
      res.locals.__catalogAllowedRoutes = [];
      res.locals.__catalogKnownRoutes = [];
      res.locals.__menuFiltered = Array.isArray(res.locals.__menuFiltered) ? res.locals.__menuFiltered : [];
      return next();
    }

    // 🔒 Security Fix #1: Users without org_node_id → DENY
    if (!orgNodeId) {
      console.warn(`[Catalog] SECURITY: User ${user?.id} (${user?.username || 'unknown'}) has no org_node_id, access denied`);
      return sendForbidden(req, res);
    }

    try {
      const effective = await getCatalogEffective(orgNodeId, {
        preferAdminRoutes: useAdminRoutes,
      });

      const { allowed, known } = computeRouteSets(effective, useAdminRoutes, { bypass: false });

      req.orgCatalogMode = effective.mode;
      req.orgAdminMode = effective.mode === 'ADMIN';
      res.locals.__catalogEffective = effective;
      res.locals.__catalogMode = effective.mode;
      res.locals.__catalogAllowedRoutes = Array.from(allowed);
      res.locals.__catalogKnownRoutes = Array.from(known);
      if (Array.isArray(effective.menu) && effective.menu.length) {
        res.locals.__menuFiltered = effective.menu;
      }

      // 🔒 Security Fix #3: Enforce access control for all routes
      if (enforceAccess) {
        const fullPath = normalizeRoute((req.baseUrl || '') + (req.path || ''));
        const matchesKnown = Array.from(known).some((route) => matchesRoute(route, fullPath));
        
        // Unknown routes → DENY by default
        if (!matchesKnown) {
          console.warn(`[Catalog] SECURITY: Unknown route ${fullPath} for org_node ${orgNodeId} (${user?.username || 'unknown'})`);
          return sendForbidden(req, res);
        }
        
        // Known route but not allowed → DENY
        const matchesAllowed = Array.from(allowed).some((route) => matchesRoute(route, fullPath));
        if (!matchesAllowed) {
          console.warn(`[Catalog] SECURITY: Access denied to ${fullPath} for org_node ${orgNodeId} (${user?.username || 'unknown'})`);
          return sendForbidden(req, res);
        }
      }

      return next();
    } catch (err) {
      console.error('[Catalog] SECURITY: Error in catalogAccess middleware:', err);
      return sendForbidden(req, res);
    }
  };
}

function isApiRequest(req) {
  const accept = String(req?.headers?.accept || '').toLowerCase();
  const xhr = !!req?.xhr;
  const requestedWith = String(req?.headers?.['x-requested-with'] || '').toLowerCase();
  const wantsJson = accept.includes('json') || requestedWith === 'xmlhttprequest';
  const isApiPath = !!req?.originalUrl && req.originalUrl.startsWith('/api');
  return xhr || wantsJson || isApiPath;
}

function sendForbidden(req, res) {
  const user = req.session?.user || null;
  if (isApiRequest(req)) {
    return res.status(403).json({ 
      error: 'forbidden',
      message: 'دسترسی به این بخش برای شما مجاز نیست'
    });
  }
  return res.status(403).render('user/unauthorized', { 
    user: user,
    message: 'شما به این صفحه دسترسی ندارید. لطفاً با مدیر سیستم تماس بگیرید.'
  });
}

async function requireOrgAdminMode(req, res, next) {
  const user = req.session?.user || null;
  const isSystemAdmin = String(user?.role || '').toUpperCase() === 'SYSTEM_ADMIN';

  // Only System Admins or users who already have orgAdminMode set (by the main middleware) can proceed
  if (req.orgAdminMode || isSystemAdmin) {
    res.locals.__isAdminTheme = true;
    return next();
  }

  // 🔒 Security Fix: Do not allow org_node mode='ADMIN' to grant admin access
  // Only System Admins should have admin mode
  return sendForbidden(req, res);
}

function __setCatalogEffectiveAccessor(fn) {
  if (typeof fn === 'function') {
    getCatalogEffective = fn;
  }
}

function __resetCatalogEffectiveAccessor() {
  getCatalogEffective = getEffectiveCatalogForOrgNode;
}

module.exports = { createCatalogAccessMiddleware, requireOrgAdminMode, __setCatalogEffectiveAccessor, __resetCatalogEffectiveAccessor };
