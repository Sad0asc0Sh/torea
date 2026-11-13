'use strict';

const pool = require('../config/db');
const PG_CONFLICT_FALLBACK_CODES = ['42P10', '42704', '42P01'];

function normalizeText(v) {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s || null;
}

function toIntOrNull(v) {
  const s = v === undefined || v === null ? '' : String(v).trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Imports debt rows into credit_sale_requests using a best-effort upsert.
 * Upsert key: (seller_user_id, customer_code, invoice_number)
 * If invoice_number is null, rows with same seller+customer+null invoice_number are merged.
 */
async function importRows(rows = []) {
  const result = { inserted: 0, updated: 0 };
  if (!rows.length) return result;

  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    const upsertSql = `
      INSERT INTO credit_sale_requests (
        customer_code, customer_name, invoice_number, invoice_amount, due_date,
        seller_user_id, final_status, source
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (seller_user_id, customer_code, invoice_number)
      DO UPDATE SET
        customer_name = EXCLUDED.customer_name,
        invoice_amount = EXCLUDED.invoice_amount,
        due_date = EXCLUDED.due_date,
        final_status = EXCLUDED.final_status,
        source = EXCLUDED.source
      RETURNING (xmax = 0) AS inserted
    `;

    const insertSql = `
      INSERT INTO credit_sale_requests (
        customer_code, customer_name, invoice_number, invoice_amount, due_date,
        seller_user_id, final_status, source
      )
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      RETURNING (xmax = 0) AS inserted
    `;

    for (const row of rows) {
      const customerCode = normalizeText(row.customer_code);
      const customerName = normalizeText(row.customer_name);
      const invoiceNumber = normalizeText(row.invoice_number);
      const invoiceAmount = Number(row.invoice_amount);
      const dueDate = row.due_date || null;
      const sellerUserId = toIntOrNull(row.seller_user_id);
      const source = row.source || 'excel';
      const finalStatus = row.final_status || 'approved';

      let res;
      try {
        res = await client.query(upsertSql, [
          customerCode,
          customerName,
          invoiceNumber,
          invoiceAmount,
          dueDate,
          sellerUserId,
          finalStatus,
          source,
        ]);
      } catch (err) {
        // اگر ایندکس منطبق با ON CONFLICT وجود نداشته باشد، درج ساده انجام می‌شود.
        if (err && PG_CONFLICT_FALLBACK_CODES.includes(err.code)) {
          res = await client.query(insertSql, [
            customerCode,
            customerName,
            invoiceNumber,
            invoiceAmount,
            dueDate,
            sellerUserId,
            finalStatus,
            source,
          ]);
        } else {
          throw err;
        }
      }
      const inserted = res.rows && res.rows[0] && res.rows[0].inserted;
      if (inserted) result.inserted += 1;
      else result.updated += 1;
    }

    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

module.exports = {
  importRows,
};
