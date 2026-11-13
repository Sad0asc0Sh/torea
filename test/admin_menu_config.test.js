const test = require('node:test');
const assert = require('node:assert/strict');
const ejs = require('ejs');
const path = require('path');

const TEMPLATE_PATH = path.join(__dirname, '..', 'src', 'views', 'partials', 'admin_menu_config.ejs');

test('admin menu config exposes getAdminMenuItems globally', async () => {
  const originalNamespace = globalThis.AdminMenuHelpers;
  try {
    delete globalThis.AdminMenuHelpers;
    await ejs.renderFile(TEMPLATE_PATH, {}, { filename: TEMPLATE_PATH });
    assert.equal(typeof globalThis.AdminMenuHelpers?.getAdminMenuItems, 'function');
    const items = globalThis.AdminMenuHelpers.getAdminMenuItems('dashboard');
    assert.ok(Array.isArray(items));
    assert.ok(items.find((item) => item.href === '/admin/dashboard'));
  } finally {
    if (originalNamespace) {
      globalThis.AdminMenuHelpers = originalNamespace;
    } else {
      delete globalThis.AdminMenuHelpers;
    }
  }
});
