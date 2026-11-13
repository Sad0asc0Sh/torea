'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const { extractEJSMetadata } = require('../../../../src/services/helpers/ejsParser.helper');

test('ejsParser.helper - extractEJSMetadata with valid EJS', () => {
  const fixturePath = path.join(__dirname, '../../../../test/fixtures/sample-view.ejs');
  const metadata = extractEJSMetadata(fixturePath);
  
  assert.ok(metadata, 'should return metadata object');
  assert.strictEqual(metadata.activeKey, 'dashboard', 'should extract activeKey');
  assert.strictEqual(metadata.pageTitle, 'داشبورد مدیریت', 'should extract pageTitle');
});

test('ejsParser.helper - extractEJSMetadata with non-existent file', () => {
  const metadata = extractEJSMetadata('/non/existent/file.ejs');
  
  assert.strictEqual(metadata, null, 'should return null for non-existent file');
});

test('ejsParser.helper - extractEJSMetadata with missing activeKey', () => {
  const fs = require('fs');
  const tmpPath = path.join(__dirname, '../../../../test/fixtures/temp-no-activekey.ejs');
  
  // Create temp file without activeKey
  fs.writeFileSync(tmpPath, `<%
const pageTitle = 'Test Page';
%>
<h1>Test</h1>
  `);
  
  const metadata = extractEJSMetadata(tmpPath);
  
  assert.ok(metadata, 'should return metadata object');
  assert.strictEqual(metadata.activeKey, null, 'activeKey should be null');
  assert.strictEqual(metadata.pageTitle, 'Test Page', 'should still extract pageTitle');
  
  // Cleanup
  fs.unlinkSync(tmpPath);
});

test('ejsParser.helper - extractEJSMetadata with various quote styles', () => {
  const fs = require('fs');
  const tmpPath = path.join(__dirname, '../../../../test/fixtures/temp-quotes.ejs');
  
  // Test single quotes
  fs.writeFileSync(tmpPath, `<%
const activeKey = 'test_key';
const pageTitle = 'Test Title';
%>
  `);
  
  let metadata = extractEJSMetadata(tmpPath);
  assert.strictEqual(metadata.activeKey, 'test_key');
  assert.strictEqual(metadata.pageTitle, 'Test Title');
  
  // Test double quotes
  fs.writeFileSync(tmpPath, `<%
const activeKey = "test_key";
const pageTitle = "Test Title";
%>
  `);
  
  metadata = extractEJSMetadata(tmpPath);
  assert.strictEqual(metadata.activeKey, 'test_key');
  assert.strictEqual(metadata.pageTitle, 'Test Title');
  
  // Cleanup
  fs.unlinkSync(tmpPath);
});
