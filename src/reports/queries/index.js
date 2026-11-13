'use strict';

const pool = require('../../config/db');
const training = require('./training');
const automation = require('./automation');
const balance = require('./balance');
const forgotten = require('./forgotten');

const CACHE = new Map();

async function tableExists(tableName) {
  if (!tableName) return false;
  if (CACHE.has(tableName)) return CACHE.get(tableName);
  try {
    const q = await pool.query(
      `SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1 LIMIT 1`,
      [tableName]
    );
    const exists = q.rows.length > 0;
    if (CACHE.size > 32) CACHE.clear();
    CACHE.set(tableName, exists);
    return exists;
  } catch (e) {
    return false;
  }
}

function emptyResult(note) {
  return {
    series: [],
    meta: {
      note: note || 'dataset_empty',
    },
  };
}

async function resolveAndRun(queryId, context = {}) {
  const q = String(queryId || '').toLowerCase();
  const registry = {
    ...automation.AUTOMATION_HANDLERS,
    ...training.TRAINING_HANDLERS,
    ...balance.BALANCE_HANDLERS,
    ...forgotten.FORGOTTEN_HANDLERS,
  };
  const handler = registry[q];
  if (!handler) return emptyResult('unknown_query');
  try {
    return await handler({ ...context, tableExists, queryId: q });
  } catch (err) {
    return {
      series: [],
      meta: {
        note: 'error',
        error: err?.message || String(err),
      },
    };
  }
}

module.exports = {
  resolveAndRun,
  emptyResult,
};
