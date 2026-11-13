'use strict';

/**
 * Legacy catalog routes that should redirect to catalog-manager.
 * Keep this list in sync across discovery and cleanup scripts.
 */
module.exports = [
  '/settings/catalog',
  '/admin/settings/catalog',
  '/settings/catalog-access',
  '/admin/settings/catalog-access'
];
