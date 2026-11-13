const EN_LOCALE_FORMATTER = new Intl.NumberFormat('en-US', {
  maximumFractionDigits: 0,
});

/**
 * Converts Persian and Arabic digits to English digits
 * @param {string|number|null|undefined} input - Input containing Persian/Arabic digits
 * @returns {string} String with English digits
 */
function toEnglishDigits(input) {
  if (input === null || input === undefined) return '';
  const str = String(input);
  const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
  const arabicDigits = '٠١٢٣٤٥٦٧٨٩';

  return str.replace(/[۰-۹٠-٩٫]/g, (ch) => {
    if (ch === '٫') return '.';
    const persianIndex = persianDigits.indexOf(ch);
    if (persianIndex !== -1) return String(persianIndex);
    const arabicIndex = arabicDigits.indexOf(ch);
    if (arabicIndex !== -1) return String(arabicIndex);
    return ch;
  });
}

/**
 * Removes grouping separators (commas, spaces, etc.) from numeric strings
 * @param {string|null|undefined} str - String containing grouping separators
 * @returns {string} String without grouping separators
 */
function normalizeGroupingSeparators(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/[,،\u00A0\u202F\u2009 ]/g, '');
}

/**
 * Parses loosely formatted integers (with Persian/Arabic digits or grouping separators).
 * Decimals are intentionally rejected because money values are stored as whole Rials.
 * @param {string|number|null|undefined} input - Input to parse
 * @returns {number|null} Parsed integer or null if invalid
 */
function parseNumberLoose(input) {
  if (input === null || input === undefined || input === '') return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    const truncated = Math.trunc(input);
    if (!Number.isSafeInteger(truncated)) return null; // only safe whole numbers are accepted
    if (truncated !== input) return null; // reject decimals explicitly
    return truncated;
  }

  const withEnglishDigits = toEnglishDigits(input);
  const cleaned = normalizeGroupingSeparators(withEnglishDigits);

  if (cleaned.includes('.')) return null;
  if (!/^-?\d+$/.test(cleaned)) return null;

  const parsed = Number.parseInt(cleaned, 10);
  return Number.isSafeInteger(parsed) ? parsed : null;
}

const parseMoneyLoose = parseNumberLoose;

/**
 * Formats a number as money with English locale formatting (comma separators)
 * @param {string|number|null|undefined} value - Value to format
 * @returns {string} Formatted money string or empty string if invalid
 */
function formatMoneyEn(value) {
  try {
    if (value === null || value === undefined || value === '') return '';

    if (typeof value === 'number') {
      if (!Number.isFinite(value)) return '';
      const truncated = Math.trunc(value);
      if (!Number.isSafeInteger(truncated)) return '';
      return EN_LOCALE_FORMATTER.format(truncated);
    }

    const parsed = parseNumberLoose(value);
    return parsed !== null ? EN_LOCALE_FORMATTER.format(parsed) : (typeof value === 'string' ? value : '');
  } catch (err) {
    return '';
  }
}

module.exports = {
  toEnglishDigits,
  normalizeGroupingSeparators,
  parseNumberLoose,
  parseMoneyLoose,
  formatMoneyEn,
};
