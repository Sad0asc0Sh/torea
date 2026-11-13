'use strict';

const fs = require('fs');

/**
 * Parse a route file to extract router method calls
 * @param {string} filePath - Absolute path to the route file
 * @returns {Array<{method: string, path: string}>} Array of route definitions
 */
function parseRouteFile(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    // Graceful degradation: return empty array on error
    return [];
  }

  // Match: router.get('/path', ...) or router.post('/path', ...)
  // Handles single quotes, double quotes, and backticks
  // ReDoS-safe pattern
  const regex = /router\.(get|post|put|delete|patch)\s*\(\s*['"`]([^'"`\r\n]+)['"`]/gi;
  const routes = [];
  let match;

  while ((match = regex.exec(content)) !== null) {
    routes.push({
      method: match[1].toUpperCase(),
      path: match[2]
    });
  }

  return routes;
}

/**
 * Normalize a route path to a consistent format
 * @param {string} path - Route path to normalize
 * @returns {string} Normalized path
 */
function normalizeRoutePath(path) {
  const safe = String(path || '').trim();
  
  // Remove leading slashes and then add one back
  const withLeadingSlash = '/' + safe.replace(/^\/+/, '');
  
  // Remove trailing slashes (but keep single '/')
  const withoutTrailing = withLeadingSlash.replace(/\/+$/, '') || '/';
  
  // Remove consecutive slashes in the middle
  const normalized = withoutTrailing.replace(/\/+/g, '/');
  
  return normalized;
}

module.exports = {
  parseRouteFile,
  normalizeRoutePath
};
