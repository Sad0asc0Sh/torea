const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fetch = require('node-fetch');

async function getSettingAny(keys) {
  const q = await pool.query(
    `SELECT key, value FROM system_settings WHERE key = ANY($1::text[])`,
    [keys]
  );
  if (!q.rows.length) return null;
  const prefer = ['telegram_bot_token', 'TELEGRAM_BOT_TOKEN', 'telegram_token'];
  for (const k of prefer) {
    const row = q.rows.find(r => r.key === k);
    if (row && row.value) return row.value;
  }
  return q.rows[0].value || null;
}

async function getTelegramBotToken() {
  return await getSettingAny(['telegram_bot_token','TELEGRAM_BOT_TOKEN','telegram_token']);
}

async function telegramGetMe(token) {
  const url = `https://api.telegram.org/bot${token}/getMe`;
  const r = await fetch(url);
  const j = await r.json().catch(() => ({}));
  return j && j.ok;
}

async function sendTelegramMessage(token, chatId, text) {
  const url = `https://api.telegram.org/bot${token}/sendMessage`;
  const r = await fetch(url, {
    method: 'POST',
    headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ chat_id: chatId, text }),
  });
  const j = await r.json().catch(() => ({}));
  if (!j.ok) {
    const err = new Error('Telegram sendMessage failed');
    err.code = 'TELEGRAM_SEND_FAILED';
    err.details = j;
    throw err;
  }
  return j;
}

function hashOtp(code) {
  const salt = crypto.randomBytes(8).toString('hex');
  const h = crypto.createHash('sha256').update(salt + ':' + code).digest('hex');
  return `${salt}$${h}`;
}
function verifyOtpHash(stored, code) {
  if (!stored) return false;
  const parts = String(stored).split('$');
  if (parts.length !== 2) return false;
  const [salt, h] = parts;
  const check = crypto.createHash('sha256').update(salt + ':' + code).digest('hex');
  return crypto.timingSafeEqual(Buffer.from(h), Buffer.from(check));
}

async function findAdminByUsername(username) {
  const q = await pool.query(
    `SELECT id, username, password_hash, telegram_id, is_active, failed_attempts, locked_until, must_change_password
     FROM system_admins
     WHERE lower(username)=lower($1)
     LIMIT 1`,
    [username]
  );
  return q.rows[0] || null;
}

async function logAdmin(adminId, action, meta, ip) {
  try {
    await pool.query(
      'INSERT INTO system_admin_audit_log(admin_id, action, meta, ip) VALUES ($1,$2,$3,$4)',
      [adminId || null, action, meta ? JSON.stringify(meta) : null, ip || null]
    );
  } catch (e) {
    console.error('audit log error:', e);
  }
}

async function bumpFailedAttempt(adminId) {
  const q = await pool.query(
    `UPDATE system_admins
     SET failed_attempts = failed_attempts + 1
     WHERE id=$1
     RETURNING failed_attempts`,
    [adminId]
  );
  const failed = (q.rows[0] && q.rows[0].failed_attempts) || 0;
  if (failed >= 5) {
    await pool.query(
      `UPDATE system_admins SET locked_until = now() + interval '15 minutes' WHERE id=$1`,
      [adminId]
    );
  }
  return failed;
}

async function clearFailedAttempt(adminId) {
  await pool.query(
    `UPDATE system_admins SET failed_attempts=0, locked_until=NULL WHERE id=$1`,
    [adminId]
  );
}

async function createOtpForAdmin(adminId) {
  const code = String(Math.floor(100000 + Math.random()*900000));
  const expiresAt = new Date(Date.now() + 5*60*1000);
  const codeHash = hashOtp(code);
  await pool.query(
    `INSERT INTO system_admin_otps(admin_id, code_hash, expires_at) VALUES ($1,$2,$3)`,
    [adminId, codeHash, expiresAt]
  );
  return { code, expiresAt };
}

async function verifyOtp(adminId, code) {
  const q = await pool.query(
    `SELECT id, code_hash, expires_at, attempts
     FROM system_admin_otps
     WHERE admin_id=$1
     ORDER BY created_at DESC
     LIMIT 1`,
    [adminId]
  );
  const row = q.rows[0];
  if (!row) return { ok:false, reason:'missing' };
  if (new Date(row.expires_at) < new Date()) return { ok:false, reason:'expired' };
  if ((row.attempts||0) >= 5) return { ok:false, reason:'too_many' };

  const ok = verifyOtpHash(row.code_hash, String(code || '').trim());
  await pool.query(`UPDATE system_admin_otps SET attempts = attempts + 1 WHERE id=$1`, [row.id]);

  if (!ok) return { ok:false, reason:'invalid' };

  await pool.query(`DELETE FROM system_admin_otps WHERE admin_id=$1`, [adminId]);
  return { ok:true };
}

function validateStrongPassword(pw) {
  const s = String(pw || '');
  if (s.length < 8) return { ok:false };
  if (!/[a-z]/.test(s)) return { ok:false };
  if (!/[A-Z]/.test(s)) return { ok:false };
  if (!/[0-9]/.test(s)) return { ok:false };
  if (!/[^A-Za-z0-9]/.test(s)) return { ok:false };
  return { ok:true };
}

async function setAdminPassword(adminId, newPassword) {
  const hash = await bcrypt.hash(newPassword, 10);
  await pool.query(
    `UPDATE system_admins
     SET password_hash=$2, must_change_password=false, password_updated_at=now()
     WHERE id=$1`,
    [adminId, hash]
  );
}

module.exports = {
  getTelegramBotToken,
  telegramGetMe,
  sendTelegramMessage,
  findAdminByUsername,
  logAdmin,
  bumpFailedAttempt,
  clearFailedAttempt,
  createOtpForAdmin,
  verifyOtp,
  validateStrongPassword,
  setAdminPassword,
};
