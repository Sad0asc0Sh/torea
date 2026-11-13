const test = require('node:test');
const assert = require('node:assert');

const {
  parseNumberLoose,
  parseMoneyLoose,
  formatMoneyEn,
} = require('../src/utils/number');

test('parseNumberLoose accepts common formatted integers', () => {
  assert.strictEqual(parseNumberLoose('1000'), 1000);
  assert.strictEqual(parseNumberLoose('1,000'), 1000);
  assert.strictEqual(parseNumberLoose('۱۰۰۰'), 1000);
  assert.strictEqual(parseNumberLoose('۱,۰۰۰'), 1000);
  assert.strictEqual(parseNumberLoose('100,000'), 100000);
  assert.strictEqual(parseNumberLoose('100 000'), 100000);
  assert.strictEqual(parseNumberLoose('100\u00A0000'), 100000);
  assert.strictEqual(parseNumberLoose('100،000'), 100000);
});

test('parseNumberLoose rejects decimals and invalid values', () => {
  assert.strictEqual(parseNumberLoose('12.5'), null);
  assert.strictEqual(parseNumberLoose('abc'), null);
  assert.strictEqual(parseNumberLoose(''), null);
  assert.strictEqual(parseNumberLoose(null), null);
  assert.strictEqual(parseNumberLoose(undefined), null);
});

test('parseMoneyLoose remains an alias for parseNumberLoose', () => {
  assert.strictEqual(parseMoneyLoose('1,000'), 1000);
  assert.strictEqual(parseMoneyLoose('12.5'), null);
});

test('formatMoneyEn normalizes and formats values', () => {
  assert.strictEqual(formatMoneyEn(1000000), '1,000,000');
  assert.strictEqual(formatMoneyEn('۱۰۰۰۰۰۰'), '1,000,000');
  assert.strictEqual(formatMoneyEn('100,000'), '100,000');
  assert.strictEqual(formatMoneyEn(null), '');
});
