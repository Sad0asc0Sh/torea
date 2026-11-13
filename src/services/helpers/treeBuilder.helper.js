'use strict';

/**
 * Build a tree structure from flat array of items
 * @param {Array<Object>} items - Flat array of catalog items with parent_key references
 * @returns {Array<Object>} Array of root items with children arrays
 */
function buildTreeStructure(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return [];
  }

  // Create a map of all items with empty children arrays
  const itemsMap = new Map();
  const processedKeys = new Set();
  
  items.forEach(item => {
    const itemCopy = { ...item, children: [] };
    itemsMap.set(item.key, itemCopy);
  });

  const roots = [];

  // Build parent-child relationships
  itemsMap.forEach(item => {
    // Prevent infinite loops by checking if we've processed this key
    if (processedKeys.has(item.key)) {
      return;
    }
    processedKeys.add(item.key);

    const parentKey = item.parent_key || item.suggested_parent_key;

    if (!parentKey) {
      // No parent - this is a root item
      roots.push(item);
    } else {
      const parent = itemsMap.get(parentKey);
      if (parent && parent.key !== item.key) {
        // Prevent circular dependencies
        parent.children.push(item);
        parent.has_children = true;
      } else {
        // Parent not found or circular reference - treat as root (orphan)
        roots.push(item);
      }
    }
  });

  // Sort recursively
  sortTree(roots);

  return roots;
}

/**
 * Sort tree items recursively by order_index then title
 * @param {Array<Object>} items - Array of items to sort (modified in place)
 */
function sortTree(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return;
  }

  items.sort((a, b) => {
    // Sort by order_index first
    const orderA = Number.isFinite(a.order_index) ? a.order_index : 0;
    const orderB = Number.isFinite(b.order_index) ? b.order_index : 0;
    
    if (orderA !== orderB) {
      return orderA - orderB;
    }

    // Then by title
    const titleA = String(a.title || a.key || '');
    const titleB = String(b.title || b.key || '');
    return titleA.localeCompare(titleB);
  });

  // Recursively sort children
  items.forEach(item => {
    if (Array.isArray(item.children) && item.children.length > 0) {
      sortTree(item.children);
    }
  });
}

/**
 * Flatten tree structure to array with depth information
 * @param {Array<Object>} tree - Tree structure (array of root items with children)
 * @param {number} depth - Current depth (default: 0)
 * @returns {Array<Object>} Flat array with depth field
 */
function flattenTree(tree, depth = 0) {
  if (!Array.isArray(tree) || tree.length === 0) {
    return [];
  }

  const result = [];

  tree.forEach(item => {
    // Add item with depth
    const flatItem = { ...item, depth };
    
    // Don't include children array in flattened output
    const children = flatItem.children;
    delete flatItem.children;
    
    result.push(flatItem);

    // Recursively flatten children
    if (Array.isArray(children) && children.length > 0) {
      const flatChildren = flattenTree(children, depth + 1);
      result.push(...flatChildren);
    }
  });

  return result;
}

module.exports = {
  buildTreeStructure,
  flattenTree
};
