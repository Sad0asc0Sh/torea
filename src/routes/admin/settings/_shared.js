'use strict';

const { toBool, toIntOrNull, safeMsg } = require('../../../utils/validators');

/**
 * Escapes HTML special characters to prevent XSS
 */
function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Masks API key securely
 */
function maskApiKey(k) {
  const s = (k || '').toString().trim();
  if (!s) return '';
  if (s.length <= 4) return '****';
  const last4 = s.slice(-4);
  const stars = '*'.repeat(Math.min(8, s.length - 4));
  return stars + last4;
}

function buildPreview(txt, apiKey = '') {
  let safe = escapeHtml((txt || '').toString());
  if (apiKey) {
    const tokens = [apiKey, encodeURIComponent(apiKey)];
    tokens.forEach((token) => {
      if (!token) return;
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      safe = safe.replace(new RegExp(escaped, 'g'), '***');
    });
  }
  return safe.length > 300 ? safe.slice(0, 300) : safe;
}

function renderSettingsPage(req, res, viewName, extra = {}) {
  return res.render(viewName, {
    user: req.session?.user || null,
    error: safeMsg(req.query?.err),
    info: safeMsg(req.query?.ok),
    warn: safeMsg(req.query?.warn),
    ...extra,
  });
}

function renderSettingsPlaceholder(req, res, activeKey, title, backHref = '/admin/settings') {
  return res.render('admin/settings/placeholder', {
    user: req.session?.user || null,
    activeKey,
    title,
    backHref,
  });
}

function normalizeText(v) {
  return (v || '').toString().trim();
}

function normalizeProviderMode(v) {
  const val = (v || '').toString().trim().toLowerCase();
  return ['cloud', 'local', 'hybrid'].includes(val) ? val : 'hybrid';
}

function normalizeStringArray(v) {
  const toArr = (val) => (Array.isArray(val) ? val : val === undefined || val === null ? [] : [val]);
  return Array.from(
    new Set(
      toArr(v)
        .map((x) => (x ?? '').toString().trim())
        .filter(Boolean)
    )
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function safeReadBody(resp) {
  if (!resp || typeof resp.text !== 'function') return '';
  try {
    return await resp.text();
  } catch (err) {
    return '';
  }
}

module.exports = {
  toBool,
  toIntOrNull,
  safeMsg,
  escapeHtml,
  maskApiKey,
  buildPreview,
  renderSettingsPage,
  renderSettingsPlaceholder,
  normalizeText,
  normalizeProviderMode,
  normalizeStringArray,
  sleep,
  safeReadBody,
};
