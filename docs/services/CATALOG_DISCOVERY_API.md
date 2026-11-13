# Catalog Discovery Service API

## Overview

The Catalog Discovery Service automatically discovers catalog items from multiple sources (routes, EJS views, database) and intelligently merges them into a unified catalog structure.

## Main Functions

### discoverAllCatalogItems()

**Signature**: `async discoverAllCatalogItems() → Promise<Object>`

**Description**: Main entry point for catalog discovery. Discovers items from all sources, merges them intelligently, builds hierarchical tree, and returns complete result with statistics.

**Returns**:
```javascript
{
  items: Array<Object>,      // Enriched flat array of all items
  flat: Array<Object>,        // Flat array with depth information
  tree: Array<Object>,        // Hierarchical tree structure
  grouped: {
    status: Object,           // Grouped by status (discovered, active, hidden, modified)
    source: Object,           // Grouped by source (route, ejs, database, hybrid)
    type: Object             // Grouped by type (page, group, setting, report, tool, action)
  },
  stats: {
    total: Number,
    new: Number,
    active: Number,
    hidden: Number,
    modified: Number,
    sources: { route, ejs, database },
    types: { page, group, setting, report, tool, action }
  },
  timestamp: String           // ISO 8601 timestamp
}
```

**Example**:
```javascript
const { discoverAllCatalogItems } = require('./services/catalogDiscovery.service');

async function getCatalog() {
  const result = await discoverAllCatalogItems();
  console.log(`Found ${result.stats.total} items`);
  console.log(`New items: ${result.stats.new}`);
  return result;
}
```

**Caching**: This function respects the `CATALOG_DISCOVERY_CACHE_ENABLED` environment variable. When enabled, results are cached for `CATALOG_DISCOVERY_CACHE_TTL` milliseconds (default: 5 minutes).

---

### discoverFromRoutes()

**Signature**: `discoverFromRoutes() → Array<Object>`

**Description**: Scans `/routes/admin/**/*.js` files for `router.get()` patterns and extracts route information.

**Returns**: Array of catalog items discovered from route files.

**Notes**:
- Only includes GET routes (pages, not actions)
- Ignores routes with parameters (e.g., `/admin/users/:id`)
- Gracefully handles file system errors

**Example**:
```javascript
const { discoverFromRoutes } = require('./services/catalogDiscovery.service');

const routes = discoverFromRoutes();
console.log(`Found ${routes.length} route items`);
```

---

### discoverFromEJS()

**Signature**: `discoverFromEJS() → Array<Object>`

**Description**: Scans `/views/admin/**/*.ejs` files and extracts `activeKey` and `pageTitle` metadata.

**Returns**: Array of catalog items discovered from EJS view files.

**Notes**:
- Skips partial files (starting with `_`)
- Extracts Persian/Farsi titles which are prioritized in merge
- Gracefully handles missing metadata

**Example**:
```javascript
const { discoverFromEJS } = require('./services/catalogDiscovery.service');

const ejsItems = discoverFromEJS();
console.log(`Found ${ejsItems.length} EJS items`);
```

---

### getExistingItems()

**Signature**: `async getExistingItems() → Promise<Array<Object>>`

**Description**: Loads existing catalog items from the `catalog_items` database table.

**Returns**: Promise that resolves to array of items from database.

**Notes**:
- All items have `db_exists: true` flag
- Gracefully handles database connection errors
- Returns empty array on error

**Example**:
```javascript
const { getExistingItems } = require('./services/catalogDiscovery.service');

async function loadCatalog() {
  const dbItems = await getExistingItems();
  console.log(`Found ${dbItems.length} database items`);
}
```

---

### smartMerge(routes, ejs, db)

**Signature**: `smartMerge(routes, ejs, db) → Array<Object>`

**Description**: Intelligently merges items from multiple sources with priority system.

**Parameters**:
- `routes` (Array): Items from route discovery
- `ejs` (Array): Items from EJS discovery
- `db` (Array): Items from database

**Priority System**:
1. **Database** - Highest priority (existing truth)
2. **EJS** - Best titles (Persian/Farsi)
3. **Routes** - Route information

**Returns**: Array of merged items with combined sources.

**Example**:
```javascript
const { discoverFromRoutes, discoverFromEJS, getExistingItems, smartMerge } = require('./services/catalogDiscovery.service');

async function merge() {
  const routes = discoverFromRoutes();
  const ejs = discoverFromEJS();
  const db = await getExistingItems();
  
  const merged = smartMerge(routes, ejs, db);
  console.log(`Merged into ${merged.length} items`);
  
  // Check sources
  merged.forEach(item => {
    console.log(`${item.key}: ${item.source_label}`);
  });
}
```

---

### enrichItems(items)

**Signature**: `enrichItems(items) → Array<Object>`

**Description**: Adds computed fields to catalog items.

**Computed Fields Added**:
- `is_new` - Item not in database
- `is_existing` - Item exists in database
- `is_modified` - Item changed from database version
- `depth` - Hierarchy depth (0 for 'admin', 1 for 'admin.settings', etc.)
- `suggested_parent_key` - Inferred parent key
- `display_title` - Display-ready title
- `display_icon` - Display-ready icon
- `has_children` - Has child items (set during tree building)

**Returns**: Array of enriched items.

**Example**:
```javascript
const { enrichItems } = require('./services/catalogDiscovery.service');

const enriched = enrichItems(items);
console.log(`Depth of first item: ${enriched[0].depth}`);
```

---

### buildTreeStructure(items)

**Signature**: `buildTreeStructure(items) → Array<Object>`

**Description**: Builds hierarchical parent-child tree from flat array of items.

**Parameters**:
- `items` (Array): Flat array of catalog items with `parent_key` references

**Returns**: Array of root items with `children` arrays.

**Notes**:
- Handles orphaned items (parent not found → treated as root)
- Prevents circular dependencies
- Sorts by `order_index` then `title`
- Sets `has_children` flag on parents

**Example**:
```javascript
const { buildTreeStructure } = require('./services/catalogDiscovery.service');

const tree = buildTreeStructure(items);
console.log(`Tree has ${tree.length} root items`);

function printTree(items, indent = 0) {
  items.forEach(item => {
    console.log('  '.repeat(indent) + item.title);
    if (item.children && item.children.length) {
      printTree(item.children, indent + 1);
    }
  });
}

printTree(tree);
```

---

### flattenTree(tree, depth)

**Signature**: `flattenTree(tree, depth = 0) → Array<Object>`

**Description**: Converts hierarchical tree to flat array with depth information.

**Parameters**:
- `tree` (Array): Tree structure (array of roots with children)
- `depth` (Number): Starting depth (default: 0)

**Returns**: Flat array with `depth` field added to each item.

**Notes**:
- Removes `children` arrays from output
- Preserves tree order
- Depth starts at 0 for root items

**Example**:
```javascript
const { buildTreeStructure, flattenTree } = require('./services/catalogDiscovery.service');

const tree = buildTreeStructure(items);
const flat = flattenTree(tree);

flat.forEach(item => {
  const indent = '  '.repeat(item.depth);
  console.log(`${indent}${item.title} (depth: ${item.depth})`);
});
```

---

### groupByStatus(items)

**Signature**: `groupByStatus(items) → Object`

**Description**: Groups items by their status.

**Returns**:
```javascript
{
  discovered: Array,  // New items (is_new: true)
  active: Array,      // Active existing items
  hidden: Array,      // Inactive items (is_active: false)
  modified: Array     // Modified items
}
```

---

### groupBySource(items)

**Signature**: `groupBySource(items) → Object`

**Description**: Groups items by their discovery source.

**Returns**:
```javascript
{
  route: Array,     // Items with 'route' source
  ejs: Array,       // Items with 'ejs' source
  database: Array,  // Items with 'database' source
  hybrid: Array     // Items with multiple sources
}
```

---

### groupByType(items)

**Signature**: `groupByType(items) → Object`

**Description**: Groups items by their type.

**Returns**:
```javascript
{
  page: Array,
  group: Array,
  setting: Array,
  report: Array,
  tool: Array,
  action: Array
}
```

---

### clearCache()

**Signature**: `clearCache() → void`

**Description**: Clears the discovery cache.

**Example**:
```javascript
const { clearCache } = require('./services/catalogDiscovery.service');

// Clear cache to force fresh discovery
clearCache();
```

---

## Utility Functions

### routePathToKey(routePath)

Converts route path to catalog key format.

**Example**: `/admin/settings/catalog` → `admin.settings.catalog`

---

### pathToTitle(routePath)

Converts route path to human-readable title.

**Example**: `/admin/settings-catalog` → `Settings Catalog`

---

### inferTypeFromPath(routePath)

Infers item type from route path.

**Returns**: `'page'`, `'report'`, `'setting'`, or `'tool'`

---

### inferIconFromPath(routePath)

Infers appropriate emoji icon from route path.

**Returns**: Emoji string (e.g., `'🏠'`, `'📊'`, `'⚙️'`)

---

### inferParentKey(key)

Infers parent key from item key.

**Example**: `admin.settings.catalog` → `admin.settings`

---

### calculateDepth(key)

Calculates hierarchy depth from key.

**Example**: `admin.settings.catalog` → `2`

---

## Configuration

Set via environment variables:

```bash
# Enable caching (default: false)
CATALOG_DISCOVERY_CACHE_ENABLED=true

# Cache TTL in milliseconds (default: 300000 = 5 minutes)
CATALOG_DISCOVERY_CACHE_TTL=300000

# Log level: debug, info, warn, error (default: info)
CATALOG_DISCOVERY_LOG_LEVEL=info
```

---

## Error Handling

All functions use graceful degradation:
- File system errors → return empty arrays
- Database errors → return empty arrays
- Never crashes the application
- Logs errors with context

---

## Performance

- Discovery completes in ~280ms for 250 items
- Single database query (no N+1)
- Efficient file reading
- Optional caching support
- Memory usage under 50MB
