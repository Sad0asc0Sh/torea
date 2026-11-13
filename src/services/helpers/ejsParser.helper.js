'use strict';

const fs = require('fs');

/**
 * Extract metadata from EJS view file
 * Looks for activeKey and pageTitle variable definitions
 * @param {string} filePath - Absolute path to the EJS file
 * @returns {{activeKey: string|null, pageTitle: string|null}|null} Extracted metadata or null on error
 */
function extractEJSMetadata(filePath) {
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    // Graceful degradation: return null on error
    return null;
  }

  // Match: const activeKey = 'value' or const activeKey = "value"
  // Handles both single and double quotes
  const activeKeyMatch = content.match(/const\s+activeKey\s*=\s*['"]([^'"]+)['"]/);
  const activeKey = activeKeyMatch ? activeKeyMatch[1] : null;

  // Match: const pageTitle = 'value' or const pageTitle = "value"
  // Handles both single and double quotes
  const pageTitleMatch = content.match(/const\s+pageTitle\s*=\s*['"]([^'"]+)['"]/);
  const pageTitle = pageTitleMatch ? pageTitleMatch[1] : null;

  return {
    activeKey,
    pageTitle
  };
}

module.exports = {
  extractEJSMetadata
};
