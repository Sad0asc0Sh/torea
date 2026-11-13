'use strict';

const assert = require('assert');
const { describe, it } = require('node:test');
const { defaultReports } = require('../src/reports/reportCatalog');

describe('reportCatalog definition', () => {
  it('includes required counts per scope', () => {
    const my = defaultReports.filter((r) => r.scope === 'MY');
    const team = defaultReports.filter((r) => r.scope === 'TEAM');
    const rivals = defaultReports.filter((r) => r.scope === 'RIVALS');
    const company = defaultReports.filter((r) => r.scope === 'COMPANY');

    assert.strictEqual(my.length, 12);
    assert.strictEqual(team.length, 12);
    assert.strictEqual(rivals.length, 8);
    assert.strictEqual(company.length, 1);
  });

  it('assigns widgets to reports', () => {
    defaultReports.forEach((r) => {
      assert.ok(Array.isArray(r.widgets), `widgets missing for ${r.key}`);
      assert.ok(r.widgets.length >= 1, `empty widgets for ${r.key}`);
    });
  });
});
