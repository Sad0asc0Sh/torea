require('dotenv').config();
const { Pool } = require('pg');
const CONSTANTS = require('./constants');

// Validate DATABASE_URL exists
if (!process.env.DATABASE_URL) {
  if (process.env.NODE_ENV === 'test') {
    console.warn('⚠️  DATABASE_URL environment variable is not set (running in test mode)');
  } else {
    console.error('❌ FATAL: DATABASE_URL environment variable is not set');
    process.exit(1);
  }
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: CONSTANTS.DB_POOL_MAX_CONNECTIONS,
  idleTimeoutMillis: CONSTANTS.DB_POOL_IDLE_TIMEOUT_MS,
  connectionTimeoutMillis: CONSTANTS.DB_POOL_CONNECTION_TIMEOUT_MS,
});

// Handle pool errors
pool.on('error', (err, client) => {
  console.error('❌ Unexpected database pool error:', err);
  console.error('   Client:', client ? 'active' : 'idle');
  // Don't exit - allow reconnection attempts
});

// Log successful connections (only in development)
if (process.env.NODE_ENV !== 'production') {
  pool.on('connect', (client) => {
    console.log('✅ New database client connected');
  });
  
  pool.on('remove', (client) => {
    console.log('⚠️  Database client removed from pool');
  });
}

// Test connection on startup (skip in test mode to avoid connection errors)
if (process.env.NODE_ENV !== 'test' && process.env.DATABASE_URL) {
  pool.query('SELECT NOW() as current_time, version() as pg_version', (err, res) => {
    if (err) {
      console.error('❌ Database connection test FAILED:', err.message);
      console.error('   Check DATABASE_URL and ensure PostgreSQL is running');
    } else {
      console.log('✅ Database connected successfully');
      console.log('   Server time:', res.rows[0].current_time);
      if (process.env.NODE_ENV !== 'production') {
        console.log('   PostgreSQL version:', res.rows[0].pg_version);
      }
    }
  });
}

module.exports = pool;
