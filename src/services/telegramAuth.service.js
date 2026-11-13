const pool = require('../config/db');
const bcrypt = require('bcryptjs');

async function getUserByUsername(username) {
  const normalizedUsername = String(username ?? '').trim();
  const q = await pool.query('SELECT * FROM users WHERE lower(trim(username)) = lower($1) LIMIT 1', [
    normalizedUsername,
  ]);
  return q.rows[0] || null;
}

async function setTelegramAndCodePending({ user_id, telegram_id, code }) {
  const current = await pool
    .query('SELECT status, active FROM users WHERE id = $1', [user_id])
    .then((r) => r.rows[0] || {})
    .catch(() => ({}));

  let nextStatus = current.status || 'pending_verification';
  let nextActive = typeof current.active === 'boolean' ? current.active : false;

  const shouldResetToPendingVerification = (nextStatus === 'pending_verification' || nextStatus === 'pending_telegram' || !nextStatus);

  if (shouldResetToPendingVerification) {
    nextStatus = 'pending_verification';
    nextActive = false;
  } else if (nextStatus === 'pending_manager') {
    nextActive = false;
  }

  // Hash the OTP code before storing
  const hashedCode = await bcrypt.hash(code, 10);
  
  await pool.query(
    `
    UPDATE users
       SET telegram_id       = $1,
        verification_code = $2,
            active            = $3,
            status            = $4
      WHERE id = $5
    `,
    [telegram_id, hashedCode, nextActive, nextStatus, user_id]
  );
}

async function setVerificationCodeOnly({ user_id, code }) {
  // Hash the OTP code before storing
  const hashedCode = await bcrypt.hash(code, 10);
  
  await pool.query(
    `
    UPDATE users
       SET verification_code = $1
     WHERE id = $2
    `,
    [hashedCode, user_id]
  );
}

// این تابع کد را چک می‌کند و بر اساس وضعیت فعلی، status را به روز می‌کند
// (active در اینجا دست‌نخورده می‌ماند).
async function verifyCodeAndActivate({ username, code }) {
  const user = await getUserByUsername(username);
  if (!user) return { ok: false, reason: 'NOT_FOUND' };

  const saved = String(user.verification_code || '');
  if (!saved) return { ok: false, reason: 'NO_CODE' };
  
  // Compare with bcrypt instead of plain text
  const isValid = await bcrypt.compare(code, saved);
  if (!isValid) return { ok: false, reason: 'BAD_CODE' };

  const currentStatus = user.status || '';

  // وضعیت تأیید شدن توسط مدیر (approved) فقط از روی DB تعیین می‌شود و فعلاً یعنی status === 'active'.
  const isApproved = currentStatus === 'active';

  let nextStatus;
  let nextActive = false;
  if (isApproved) {
    nextStatus = 'active';
    nextActive = user.active !== false;
  } else if (currentStatus === 'rejected') {
    nextStatus = 'rejected';
    nextActive = false;
  } else {
    nextStatus = 'pending_manager';
    nextActive = false;
  }

  await pool.query(
    `
    UPDATE users
        SET status = $1,
            verification_code = NULL,
            active = $2
      WHERE id = $3
    `,
    [nextStatus, nextActive, user.id]
  );

  return {
    ok: true,
    user_id: user.id,
    role: user.role,
    status: nextStatus,
    // active بر اساس وضعیت محاسبه و ذخیره‌سازی می‌شود.
    active: nextActive,
  };
}

module.exports = {
  getUserByUsername,
  setTelegramAndCodePending,
  setVerificationCodeOnly,
  verifyCodeAndActivate,
};
