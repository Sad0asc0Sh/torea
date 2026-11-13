/**
 * Test: Service Worker and Scripts Loading
 * Verifies that scripts load independently of THEME_DISABLED setting
 */

const test = require('node:test');
const assert = require('node:assert');

test('THEME_DISABLED and SCRIPTS_DISABLED are separate variables', () => {
  // Simulate the logic from app.js
  const testCases = [
    {
      env: { THEME_DISABLED: 'true', SCRIPTS_DISABLED: undefined },
      expected: { themeDisabled: true, scriptsDisabled: false }
    },
    {
      env: { THEME_DISABLED: 'false', SCRIPTS_DISABLED: 'true' },
      expected: { themeDisabled: false, scriptsDisabled: true }
    },
    {
      env: { THEME_DISABLED: 'true', SCRIPTS_DISABLED: 'true' },
      expected: { themeDisabled: true, scriptsDisabled: true }
    },
    {
      env: { THEME_DISABLED: undefined, SCRIPTS_DISABLED: undefined },
      expected: { themeDisabled: false, scriptsDisabled: false }
    }
  ];

  testCases.forEach(({ env, expected }) => {
    const __themeDisabled = ['1', 'true', 'yes', 'on'].includes(
      String(env.THEME_DISABLED || '').toLowerCase()
    );
    const __scriptsDisabled = ['1', 'true', 'yes', 'on'].includes(
      String(env.SCRIPTS_DISABLED || '').toLowerCase()
    );

    assert.strictEqual(
      __themeDisabled,
      expected.themeDisabled,
      `themeDisabled should be ${expected.themeDisabled} for THEME_DISABLED=${env.THEME_DISABLED}`
    );
    assert.strictEqual(
      __scriptsDisabled,
      expected.scriptsDisabled,
      `scriptsDisabled should be ${expected.scriptsDisabled} for SCRIPTS_DISABLED=${env.SCRIPTS_DISABLED}`
    );
  });
});

test('Service Worker cache version is updated to v2', () => {
  const fs = require('fs');
  const path = require('path');
  const swPath = path.join(__dirname, '../src/public/sw.js');
  const swContent = fs.readFileSync(swPath, 'utf-8');
  
  assert.ok(
    swContent.includes("const CACHE_VERSION = 'v2'"),
    'Service Worker should use CACHE_VERSION v2'
  );
  assert.ok(
    swContent.includes('CACHE_STATIC'),
    'Service Worker should define CACHE_STATIC'
  );
  assert.ok(
    swContent.includes('CACHE_DYNAMIC'),
    'Service Worker should define CACHE_DYNAMIC'
  );
});

test('sw-update-notifier.js exists and has update checking logic', () => {
  const fs = require('fs');
  const path = require('path');
  const notifierPath = path.join(__dirname, '../src/public/js/sw-update-notifier.js');
  
  assert.ok(
    fs.existsSync(notifierPath),
    'sw-update-notifier.js should exist'
  );
  
  const content = fs.readFileSync(notifierPath, 'utf-8');
  assert.ok(
    content.includes('registration.update()'),
    'sw-update-notifier should check for updates'
  );
  assert.ok(
    content.includes('updatefound'),
    'sw-update-notifier should listen for updatefound events'
  );
});
