'use strict';

const fs = require('fs');
const path = require('path');
const pool = require('../config/db');
const { parseRouteFile, normalizeRoutePath } = require('./helpers/routeParser.helper');
const { extractEJSMetadata } = require('./helpers/ejsParser.helper');
const { buildTreeStructure, flattenTree } = require('./helpers/treeBuilder.helper');
const DEPRECATED_CATALOG_ROUTES = require('../config/deprecatedCatalogRoutes');

// Configuration from environment variables
const CONFIG = {
  CACHE_ENABLED: process.env.CATALOG_DISCOVERY_CACHE_ENABLED === 'true',
  CACHE_TTL: parseInt(process.env.CATALOG_DISCOVERY_CACHE_TTL || '300000', 10),
  LOG_LEVEL: process.env.CATALOG_DISCOVERY_LOG_LEVEL || 'info'
};
let deprecatedRoutesSet = null;
function getDeprecatedRoutesSet() {
  if (!deprecatedRoutesSet) {
    deprecatedRoutesSet = new Set(
      DEPRECATED_CATALOG_ROUTES.flatMap((route) => {
        const lower = route.toLowerCase();
        return lower.startsWith('/admin') ? [lower] : [lower, `/admin${lower}`];
      })
    );
  }
  return deprecatedRoutesSet;
}

// Simple logger with configurable log level
const logger = {
  debug: (...args) => {
    if (CONFIG.LOG_LEVEL === 'debug') console.log('[DEBUG]', ...args);
  },
  info: (...args) => {
    if (['debug', 'info'].includes(CONFIG.LOG_LEVEL)) console.log('[INFO]', ...args);
  },
  warn: (...args) => {
    if (['debug', 'info', 'warn'].includes(CONFIG.LOG_LEVEL)) console.warn('[WARN]', ...args);
  },
  error: (...args) => {
    console.error('[ERROR]', ...args);
  }
};

// Cache storage
let cache = { data: null, timestamp: null };

/**
 * Clear discovery cache
 */
function clearCache() {
  cache = { data: null, timestamp: null };
  logger.info('Discovery cache cleared');
}

/**
 * Recursively walk directory to find all files with given extension
 * @param {string} dir - Directory to walk
 * @param {string} ext - File extension (e.g., '.js', '.ejs')
 * @returns {Array<string>} Array of absolute file paths
 */
function walkDirectory(dir, ext) {
  let files = [];
  
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    
    for (const entry of entries) {
      // Skip hidden files/directories
      if (entry.name.startsWith('.')) continue;
      
      // Skip partial EJS files
      if (ext === '.ejs' && entry.name.startsWith('_')) continue;
      
      const fullPath = path.join(dir, entry.name);
      
      if (entry.isDirectory()) {
        // Recursively walk subdirectories
        files = files.concat(walkDirectory(fullPath, ext));
      } else if (entry.isFile() && entry.name.endsWith(ext)) {
        files.push(fullPath);
      }
    }
  } catch (err) {
    logger.warn(`Failed to walk directory ${dir}:`, err.message);
  }
  
  return files;
}

/**
 * Convert route path to catalog key
 * @param {string} routePath - Route path (e.g., '/admin/settings/catalog')
 * @returns {string} Catalog key (e.g., 'admin.settings.catalog')
 */
function routePathToKey(routePath) {
  const normalized = normalizeRoutePath(routePath);
  // Remove leading /admin/
  const withoutAdmin = normalized.replace(/^\/admin\/?/, '');
  // Convert slashes to dots
  const key = withoutAdmin.split('/').filter(Boolean).join('.');
  return key ? `admin.${key}` : 'admin';
}

/**
 * Convert path to human-readable title
 * @param {string} routePath - Route path
 * @returns {string} Title
 */
function pathToTitle(routePath) {
  const normalized = normalizeRoutePath(routePath);
  const segments = normalized.split('/').filter(Boolean);
  const lastSegment = segments[segments.length - 1] || 'Admin';
  
  // Convert kebab-case or snake_case to Title Case
  return lastSegment
    .split(/[-_]/)
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * Infer item type from route path
 * @param {string} routePath - Route path
 * @returns {string} Type (page, report, setting, tool)
 */
function inferTypeFromPath(routePath) {
  const normalized = normalizeRoutePath(routePath).toLowerCase();
  
  if (normalized.includes('/reports') || normalized.includes('/report')) return 'report';
  if (normalized.includes('/settings') || normalized.includes('/setting')) return 'setting';
  if (normalized.includes('/tools') || normalized.includes('/tool')) return 'tool';
  if (normalized.includes('/definitions') || normalized.includes('/definition')) return 'setting';
  
  return 'page';
}

/**
 * Infer icon from route path
 * @param {string} routePath - Route path
 * @returns {string} Icon emoji
 */
function inferIconFromPath(routePath) {
  const normalized = normalizeRoutePath(routePath).toLowerCase();
  
  if (normalized === '/admin' || normalized.includes('/dashboard')) return '🏠';
  if (normalized.includes('/reports') || normalized.includes('/report')) return '📊';
  if (normalized.includes('/settings') || normalized.includes('/setting')) return '⚙️';
  if (normalized.includes('/users') || normalized.includes('/user')) return '👥';
  if (normalized.includes('/tools') || normalized.includes('/tool')) return '🔧';
  if (normalized.includes('/inbox')) return '📥';
  if (normalized.includes('/definitions')) return '📋';
  if (normalized.includes('/balance')) return '💰';
  if (normalized.includes('/system')) return '🖥️';
  
  return '📄';
}

/**
 * Infer type from activeKey
 * @param {string} activeKey - Active key from EJS
 * @returns {string} Type
 */
function inferTypeFromActiveKey(activeKey) {
  const key = String(activeKey || '').toLowerCase();
  
  if (key.includes('report')) return 'report';
  if (key.includes('setting')) return 'setting';
  if (key.includes('tool')) return 'tool';
  if (key.includes('definition')) return 'setting';
  
  return 'page';
}

/**
 * Infer parent key from key
 * @param {string} key - Item key (e.g., 'admin.settings.catalog')
 * @returns {string|null} Parent key (e.g., 'admin.settings') or null
 */
function inferParentKey(key) {
  const parts = String(key || '').split('.');
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join('.');
}

/**
 * Calculate depth from key
 * @param {string} key - Item key
 * @returns {number} Depth (0 for 'admin', 1 for 'admin.settings', etc.)
 */
function calculateDepth(key) {
  const parts = String(key || '').split('.');
  return parts.length - 1;
}

/**
 * Discover catalog items from route files
 * @returns {Array<Object>} Array of discovered items from routes
 */
function discoverFromRoutes() {
  const startTime = Date.now();
  const routesDir = path.resolve(__dirname, '..', 'routes', 'admin');
  
  try {
    if (!fs.existsSync(routesDir)) {
      logger.warn('Admin routes directory not found:', routesDir);
      return [];
    }

    const routeFiles = walkDirectory(routesDir, '.js');
    logger.debug(`Found ${routeFiles.length} route files`);

    const discovered = [];

    routeFiles.forEach(filePath => {
      const routes = parseRouteFile(filePath);
      
      routes.forEach(({ method, path: routePath }) => {
        // Only include GET routes (pages, not actions)
        if (method !== 'GET') return;
        
        // Skip routes with parameters (e.g., /admin/users/:id)
        if (routePath.includes(':')) return;
        
        const key = routePathToKey(routePath);
        const normalized = normalizeRoutePath(routePath);
        const normalizedLower = normalized.toLowerCase();

        const deprecatedRoutes = getDeprecatedRoutesSet();
        if (deprecatedRoutes.has(normalizedLower)) {
          logger.debug(`Skipping deprecated route ${routePath}`);
          return;
        }
        
        // Ensure route starts with /admin
        const fullRoute = normalized.startsWith('/admin') 
          ? normalized 
          : `/admin${normalized}`;

        const item = {
          key,
          title: pathToTitle(routePath),
          type: inferTypeFromPath(routePath),
          route_admin: fullRoute,
          route_user: null,
          parent_key: inferParentKey(key),
          order_index: 0,
          is_active: true,
          icon: inferIconFromPath(routePath),
          metadata: {},
          sources: ['route'],
          source_label: 'route',
          file_path: filePath,
          discovered_at: new Date().toISOString()
        };

        discovered.push(item);
      });
    });

    const duration = Date.now() - startTime;
    logger.info(`Discovered ${discovered.length} items from routes in ${duration}ms`);
    
    return discovered;
  } catch (err) {
    logger.error('Route discovery failed:', err.message);
    return [];
  }
}

/**
 * Discover catalog items from EJS view files
 * @returns {Array<Object>} Array of discovered items from EJS files
 */
function discoverFromEJS() {
  const startTime = Date.now();
  const viewsDir = path.resolve(__dirname, '..', 'views', 'admin');
  
  try {
    if (!fs.existsSync(viewsDir)) {
      logger.warn('Admin views directory not found:', viewsDir);
      return [];
    }

    const ejsFiles = walkDirectory(viewsDir, '.ejs');
    logger.debug(`Found ${ejsFiles.length} EJS files`);

    const discovered = [];

    ejsFiles.forEach(filePath => {
      const metadata = extractEJSMetadata(filePath);
      
      if (!metadata || !metadata.activeKey) return;

      const { activeKey, pageTitle } = metadata;
      
      // Convert activeKey to standard key format
      // activeKey might be like 'dashboard' or 'settings_catalog'
      const keyParts = activeKey.split(/[_-]/).filter(Boolean);
      const key = keyParts.length > 0 ? `admin.${keyParts.join('.')}` : 'admin';

      const item = {
        key,
        title: pageTitle || pathToTitle(activeKey),
        type: inferTypeFromActiveKey(activeKey),
        route_admin: null,
        route_user: null,
        parent_key: inferParentKey(key),
        order_index: 0,
        is_active: true,
        icon: null,
        metadata: { activeKey },
        sources: ['ejs'],
        source_label: 'ejs',
        file_path: filePath,
        discovered_at: new Date().toISOString()
      };

      discovered.push(item);
    });

    const duration = Date.now() - startTime;
    logger.info(`Discovered ${discovered.length} items from EJS in ${duration}ms`);
    
    return discovered;
  } catch (err) {
    logger.error('EJS discovery failed:', err.message);
    return [];
  }
}

/**
 * Get existing catalog items from database
 * @returns {Promise<Array<Object>>} Array of items from database
 */
async function getExistingItems() {
  const startTime = Date.now();
  
  try {
    const result = await pool.query(`
      SELECT 
        key, title, type, description,
        route_admin, route_user,
        parent_key, order_index,
        is_active, icon, metadata,
        created_at, updated_at
      FROM catalog_items
      ORDER BY order_index ASC, key ASC
    `);

    const items = result.rows.map(row => ({
      ...row,
      sources: ['database'],
      source_label: 'database',
      db_exists: true,
      discovered_at: new Date().toISOString()
    }));

    const duration = Date.now() - startTime;
    logger.info(`Loaded ${items.length} items from database in ${duration}ms`);
    
    return items;
  } catch (err) {
    logger.error('Database query failed:', err.message);
    return [];
  }
}

/**
 * Check if item has been modified compared to database version
 * @param {Object} item - Current item
 * @param {Object} dbItem - Database item
 * @returns {boolean} True if modified
 */
function checkIfModified(item, dbItem) {
  if (!dbItem) return false;
  
  // Check if key fields differ
  const fieldsToCheck = ['title', 'type', 'route_admin', 'parent_key', 'is_active'];
  
  return fieldsToCheck.some(field => {
    const current = item[field];
    const db = dbItem[field];
    return current !== db;
  });
}

/**
 * Smart merge items from multiple sources with priority system
 * Priority: Database > EJS > Routes
 * @param {Array<Object>} routes - Items from routes
 * @param {Array<Object>} ejs - Items from EJS
 * @param {Array<Object>} db - Items from database
 * @returns {Array<Object>} Merged array with combined data
 */
function smartMerge(routes, ejs, db) {
  const startTime = Date.now();
  const merged = new Map();

  // Helper to merge sources
  const addSource = (item, source) => {
    if (!item.sources.includes(source)) {
      item.sources.push(source);
    }
  };

  // Step 1: Add all database items (highest priority)
  db.forEach(item => {
    merged.set(item.key, { ...item });
  });

  // Step 2: Add/enrich with EJS items (best titles)
  ejs.forEach(ejsItem => {
    const existing = merged.get(ejsItem.key);
    
    if (existing) {
      // Enrich existing with EJS title (Persian/Farsi titles are better)
      if (ejsItem.title && ejsItem.title !== ejsItem.key) {
        existing.title = ejsItem.title;
      }
      addSource(existing, 'ejs');
      existing.file_path = ejsItem.file_path;
    } else {
      // New item from EJS
      merged.set(ejsItem.key, { ...ejsItem, is_new: true });
    }
  });

  // Step 3: Add/enrich with route items
  routes.forEach(routeItem => {
    const existing = merged.get(routeItem.key);
    
    if (existing) {
      // Enrich existing with route information
      if (routeItem.route_admin) {
        existing.route_admin = routeItem.route_admin;
      }
      if (!existing.icon && routeItem.icon) {
        existing.icon = routeItem.icon;
      }
      addSource(existing, 'route');
    } else {
      // New item from route
      merged.set(routeItem.key, { ...routeItem, is_new: true });
    }
  });

  // Step 4: Update source labels
  merged.forEach(item => {
    item.source_label = item.sources.join(' + ');
  });

  const result = Array.from(merged.values());
  const duration = Date.now() - startTime;
  logger.info(`Merged ${result.length} items in ${duration}ms`);
  
  return result;
}

/**
 * Enrich items with computed fields
 * @param {Array<Object>} items - Items to enrich
 * @returns {Array<Object>} Enriched items
 */
function enrichItems(items) {
  return items.map(item => {
    const enriched = { ...item };

    // Mark items as new/existing/modified
    enriched.is_new = !enriched.db_exists;
    enriched.is_existing = !!enriched.db_exists;
    enriched.is_modified = false; // TODO: implement modification detection

    // Calculate depth
    enriched.depth = calculateDepth(enriched.key);

    // Infer parent if not set
    if (!enriched.parent_key) {
      enriched.suggested_parent_key = inferParentKey(enriched.key);
    }

    // Set display fields
    enriched.display_title = enriched.title || enriched.key;
    enriched.display_icon = enriched.icon || inferIconFromPath(enriched.route_admin || '');

    // Mark if has children (will be set during tree building)
    enriched.has_children = false;

    return enriched;
  });
}

/**
 * Group items by status
 * @param {Array<Object>} items - Items to group
 * @returns {Object} Grouped by status
 */
function groupByStatus(items) {
  return {
    discovered: items.filter(i => i.is_new),
    active: items.filter(i => i.is_active && !i.is_new),
    hidden: items.filter(i => !i.is_active),
    modified: items.filter(i => i.is_modified)
  };
}

/**
 * Group items by source
 * @param {Array<Object>} items - Items to group
 * @returns {Object} Grouped by source
 */
function groupBySource(items) {
  return {
    route: items.filter(i => i.sources.includes('route')),
    ejs: items.filter(i => i.sources.includes('ejs')),
    database: items.filter(i => i.sources.includes('database')),
    hybrid: items.filter(i => i.sources.length > 1)
  };
}

/**
 * Group items by type
 * @param {Array<Object>} items - Items to group
 * @returns {Object} Grouped by type
 */
function groupByType(items) {
  const types = ['page', 'group', 'setting', 'report', 'tool', 'action'];
  const grouped = {};
  
  types.forEach(type => {
    grouped[type] = items.filter(i => i.type === type);
  });
  
  return grouped;
}

/**
 * Calculate statistics from items
 * @param {Array<Object>} items - Items to analyze
 * @returns {Object} Statistics object
 */
function calculateStats(items) {
  const statusGroups = groupByStatus(items);
  const sourceGroups = groupBySource(items);
  const typeGroups = groupByType(items);

  return {
    total: items.length,
    new: statusGroups.discovered.length,
    active: statusGroups.active.length,
    hidden: statusGroups.hidden.length,
    modified: statusGroups.modified.length,
    sources: {
      route: sourceGroups.route.length,
      ejs: sourceGroups.ejs.length,
      database: sourceGroups.database.length
    },
    types: {
      page: typeGroups.page.length,
      group: typeGroups.group.length,
      setting: typeGroups.setting.length,
      report: typeGroups.report.length,
      tool: typeGroups.tool.length,
      action: typeGroups.action.length
    }
  };
}

/**
 * Main entry point: Discover all catalog items from all sources
 * @returns {Promise<Object>} Complete discovery result
 */
async function discoverAllCatalogItems() {
  const overallStart = Date.now();

  // Check cache
  if (CONFIG.CACHE_ENABLED && cache.data && cache.timestamp) {
    const age = Date.now() - cache.timestamp;
    if (age < CONFIG.CACHE_TTL) {
      logger.info(`Returning cached discovery result (age: ${age}ms)`);
      return cache.data;
    }
  }

  logger.info('Starting catalog discovery...');

  try {
    // Step 1: Discover from all sources
    const routes = discoverFromRoutes();
    const ejs = discoverFromEJS();
    const db = await getExistingItems();

    // Step 2: Smart merge
    const merged = smartMerge(routes, ejs, db);

    // Step 3: Enrich items
    const enriched = enrichItems(merged);

    // Step 4: Build tree
    const tree = buildTreeStructure(enriched);

    // Step 5: Flatten tree with depth
    const flat = flattenTree(tree);

    // Step 6: Group items
    const grouped = {
      status: groupByStatus(enriched),
      source: groupBySource(enriched),
      type: groupByType(enriched)
    };

    // Step 7: Calculate stats
    const stats = calculateStats(enriched);

    // Build result
    const result = {
      items: enriched,
      flat,
      tree,
      grouped,
      stats,
      timestamp: new Date().toISOString()
    };

    const duration = Date.now() - overallStart;
    logger.info(`Discovery completed in ${duration}ms`);

    // Update cache
    if (CONFIG.CACHE_ENABLED) {
      cache.data = result;
      cache.timestamp = Date.now();
      logger.debug('Cache updated');
    }

    return result;
  } catch (err) {
    logger.error('Discovery failed:', err);
    throw err;
  }
}

module.exports = {
  discoverAllCatalogItems,
  discoverFromRoutes,
  discoverFromEJS,
  getExistingItems,
  smartMerge,
  enrichItems,
  buildTreeStructure,
  flattenTree,
  groupByStatus,
  groupBySource,
  groupByType,
  clearCache,
  // Export utility functions for testing
  routePathToKey,
  pathToTitle,
  inferTypeFromPath,
  inferIconFromPath,
  inferTypeFromActiveKey,
  inferParentKey,
  calculateDepth,
  walkDirectory
};
