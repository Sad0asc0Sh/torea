(function () {
  function toEnglishDigits(str) {
    if (str == null) return '';
    const persianDigits = '۰۱۲۳۴۵۶۷۸۹';
    const arabicDigits = '٠١٢٣٤٥٦٧٨٩';
    return String(str).replace(/[۰-۹٠-٩٫.]/g, function (ch) {
      if (ch === '٫' || ch === '.') return '.';
      const pIndex = persianDigits.indexOf(ch);
      if (pIndex !== -1) return String(pIndex);
      const aIndex = arabicDigits.indexOf(ch);
      if (aIndex !== -1) return String(aIndex);
      return ch;
    });
  }

  function stripSeparators(str) {
    return str.replace(/[,،\u00A0\u202F\u2009 ]/g, '');
  }

  function cleanNumericInput(value) {
    const normalized = stripSeparators(toEnglishDigits(value || '')).replace(/[.٫]/g, '');
    // Money fields are integer-only; remove anything except digits.
    return normalized.replace(/[^\d]/g, '');
  }

  function formatGrouped(value) {
    if (!value) return '';
    return value.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function digitsBeforeCaret(rawValue, caret) {
    const slice = (rawValue || '').slice(0, caret);
    return cleanNumericInput(slice).length;
  }

  function caretFromDigitIndex(formatted, digitIndex) {
    if (digitIndex <= 0) return 0;
    let seen = 0;
    for (let i = 0; i < formatted.length; i += 1) {
      if (/\d/.test(formatted[i])) {
        seen += 1;
        if (seen === digitIndex) return i + 1;
      }
    }
    return formatted.length;
  }

  function formatField(el) {
    if (!el) return;
    const raw = el.value || '';
    const caretPos =
      document.activeElement === el && typeof el.selectionStart === 'number'
        ? el.selectionStart
        : raw.length;
    const digitsToLeft = digitsBeforeCaret(raw, caretPos);
    const cleaned = cleanNumericInput(raw);
    const formatted = formatGrouped(cleaned);
    el.value = formatted;
    if (document.activeElement === el && typeof el.setSelectionRange === 'function') {
      const newPos = caretFromDigitIndex(formatted, digitsToLeft);
      el.setSelectionRange(newPos, newPos);
    }
  }

  function attach(el) {
    if (!el || el.__moneyFormatterAttached) return;
    el.__moneyFormatterAttached = true;
    formatField(el);
    el.addEventListener('input', function () {
      formatField(el);
    });
  }

  function hydrateAll() {
    const nodes = document.querySelectorAll('.js-money,[data-money="true"]');
    nodes.forEach(attach);
  }

  document.addEventListener('DOMContentLoaded', hydrateAll);
  document.addEventListener('focusin', function (evt) {
    const target = evt.target;
    if (
      target &&
      ((target.classList && target.classList.contains('js-money')) ||
        target.getAttribute('data-money') === 'true')
    ) {
      attach(target);
    }
  });
})();
