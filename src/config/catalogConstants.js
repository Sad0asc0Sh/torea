'use strict';

/**
 * Shared constants for catalog system
 */

/**
 * Valid catalog item types
 * This list must be kept in sync with the database CHECK constraint
 */
const VALID_CATALOG_TYPES = [
  'group',
  'page',
  'tool',
  'report',
  'form',
  'setting',
  'action'
];

/**
 * Default catalog item type
 */
const DEFAULT_CATALOG_TYPE = 'page';

module.exports = {
  VALID_CATALOG_TYPES,
  DEFAULT_CATALOG_TYPE,
};
