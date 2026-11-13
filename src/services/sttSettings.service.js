'use strict';

const pool = require('../config/db');

async function fetchSttSettings() {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS public.admin_settings (
        id SERIAL PRIMARY KEY,
        subject VARCHAR NOT NULL,
        key VARCHAR NOT NULL,
        value TEXT NULL,
        created_at TIMESTAMP DEFAULT now(),
        updated_at TIMESTAMP DEFAULT now(),
        UNIQUE(subject, key)
      )
    `);
    const res = await pool.query(`SELECT key, value FROM public.admin_settings WHERE subject = 'stt'`);
    const map = {};
    (res.rows || []).forEach((row) => {
      map[row.key] = row.value;
    });
    return {
      token: map.token || null,
      base_url: map.base_url || null,
      model_default: map.model_default || null,
    };
  } catch (err) {
    return { token: null, base_url: null, model_default: null };
  }
}

module.exports = {
  fetchSttSettings,
};
