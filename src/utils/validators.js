// src/utils/validators.js
'use strict';

/**
 * Convert value to integer or return null
 * @param {*} value - Input value
 * @returns {number|null}
 */
function toIntOrNull(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? Math.floor(n) : null;
}

/**
 * Convert value to number (float) or return null
 * @param {*} value - Input value
 * @returns {number|null}
 */
function toNumberOrNull(value) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Convert value to boolean
 * @param {*} value - Input value
 * @param {boolean} defaultValue - Default if value is null/undefined
 * @returns {boolean}
 */
function toBool(value, defaultValue = false) {
  if (value === undefined || value === null) return defaultValue;
  if (typeof value === 'boolean') return value;
  const s = String(value).trim().toLowerCase();
  return ['1', 'true', 't', 'yes', 'y', 'on'].includes(s);
}

/**
 * Normalize title/text (trim and optionally limit length)
 * @param {*} value - Input value
 * @param {number} maxLength - Maximum length (default: 255)
 * @returns {string}
 */
function normalizeTitle(value, maxLength = 255) {
  const text = (value || '').toString().trim();
  return text.length > maxLength ? text.slice(0, maxLength) : text;
}

/**
 * Safe message truncation (for error messages, etc.)
 * @param {*} value - Input value
 * @param {number} maxLength - Maximum length (default: 2000)
 * @returns {string|null}
 */
function safeMsg(value, maxLength = 2000) {
  if (!value) return null;
  const s = String(value);
  return s.length > maxLength ? s.slice(0, maxLength) : s;
}

/**
 * Validate and normalize email
 * @param {string} email
 * @returns {{valid: boolean, normalized: string|null}}
 */
function normalizeEmail(email) {
  const trimmed = (email || '').toString().trim().toLowerCase();
  const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
  return { valid, normalized: valid ? trimmed : null };
}

/**
 * Validate Iranian phone number (09xxxxxxxxx)
 * @param {string} phone
 * @returns {{valid: boolean, normalized: string|null}}
 */
function normalizePhone(phone) {
  const trimmed = (phone || '').toString().trim();
  const valid = /^09\d{9}$/.test(trimmed);
  return { valid, normalized:  valid ? trimmed : null };
}

module.exports = {
  toIntOrNull,
  toNumberOrNull,
  toBool,
  normalizeTitle,
  safeMsg,
  normalizeEmail,
  normalizePhone,
};
