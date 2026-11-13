'use strict';

function normalizeRoute(path = '') {
  const safe = String(path || '').split('?')[0].replace(/\/+$/, '');
  return safe || '/';
}

function matchesRoute(baseRoute, targetPath) {
  const base = normalizeRoute(baseRoute);
  const target = normalizeRoute(targetPath);
  return target === base || target.startsWith(base + '/');
}

module.exports = { normalizeRoute, matchesRoute };
