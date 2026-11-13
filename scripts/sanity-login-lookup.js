#!/usr/bin/env node
/**
 * Minimal sanity check for username lookup and bcrypt hash.
 *
 * Usage:
 *   DATABASE_URL=postgres://... node scripts/sanity-login-lookup.js [password]
 *
 * The optional password argument is compared against the stored password_hash.
 */

require('dotenv').config();
const bcrypt = require('bcryptjs');
const authService = require('../src/services/auth.service');

async function main() {
  const password = process.argv[2];

  const userExact = await authService.getUserByUsername('Mahmudmummy');
  const userLower = await authService.getUserByUsername('mahmudmummy');

  console.log('Mahmudmummy found:', !!userExact);
  console.log('mahmudmummy found:', !!userLower);
  console.log('Same row:', !!(userExact && userLower && userExact.id === userLower.id));

  if (!userExact?.password_hash) {
    console.log('password_hash missing for user; cannot run bcrypt.compare');
    return;
  }

  if (!password) {
    console.log('Pass the password as an argument to test bcrypt.compare.');
    return;
  }

  const ok = await bcrypt.compare(password, userExact.password_hash);
  console.log('bcrypt.compare result:', ok);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
