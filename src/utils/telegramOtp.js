const DEFAULT_FALLBACK_NAME = 'کاربر';
const ADMIN_FALLBACK_NAME = 'ادمین';

function formatOtpIntro(name, fallbackName = DEFAULT_FALLBACK_NAME) {
  const safe = String(name || '').trim() || fallbackName;
  return `${safe} عزیز شما برای ورود به دستیار Toinfinity درخواست ورود دادید کد احراز هویت شما 👇👇👇`;
}

function normalizeOtpCode(code) {
  const codeText = String(code ?? '').trim();
  if (!codeText) throw new Error('OTP code is required');
  return codeText;
}

function throwIfTelegramErrors(errors) {
  if (!errors || !errors.length) return;
  const err = errors[0].error ?? new Error('Telegram sendMessage failed');
  err.code = err.code || 'TELEGRAM_SEND_FAILED';
  err.details = errors;
  throw err;
}

module.exports = {
  DEFAULT_FALLBACK_NAME,
  ADMIN_FALLBACK_NAME,
  formatOtpIntro,
  normalizeOtpCode,
  throwIfTelegramErrors,
};
