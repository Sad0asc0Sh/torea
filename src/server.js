require('dotenv').config();
const http = require('http');
const app = require('./app');
const pool = require('./config/db');
const jobs = require('./jobs');

const PORT = parseInt(process.env.PORT || '3000', 10);
const HOST = process.env.HOST || '127.0.0.1';

const server = http.createServer(app);

server.listen(PORT, HOST, () => {
  console.log(`✅ ToInfinity running on http://${HOST}:${PORT}`);
  
  // Start scheduled jobs
  if (process.env.ENABLE_CRON_JOBS !== 'false') {
    jobs.startAllJobs();
  }
});

server.on('error', (err) => {
  console.error('❌ server listen error:', err);
  process.exit(1);
});

// Handle graceful shutdown
async function gracefulShutdown(signal) {
  console.log(`\n⚠️  Received ${signal}, shutting down gracefully...`);
  
  // 1. Stop accepting new connections
  server.close(() => {
    console. log('✅ HTTP server closed');
  });
  
  // 2. Stop scheduled jobs
  try {
    jobs.stopAllJobs();
    console.log('✅ Cron jobs stopped');
  } catch (err) {
    console.error('❌ Error stopping jobs:', err);
  }
  
  // 3. Close database pool
  try {
    await pool.end();
    console.log('✅ Database pool closed');
  } catch (err) {
    console.error('❌ Error closing database pool:', err);
  }
  
  // 4. Exit process
  console.log('👋 Goodbye!');
  process.exit(0);
}

process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
