'use strict';

/**
 * Application-wide constants
 * Centralized configuration to avoid magic numbers throughout codebase
 */

module.exports = {
  // Text Length Limits
  MAX_MESSAGE_LENGTH: 2000,
  MAX_TITLE_LENGTH: 255,
  MAX_DESCRIPTION_LENGTH: 5000,
  MAX_COMMENT_LENGTH: 1000,
  MAX_USERNAME_LENGTH: 50,
  MIN_USERNAME_LENGTH: 3,
  MIN_PASSWORD_LENGTH: 6,
  
  // AI / Training Configuration
  AI_SUMMARY_WORD_TARGET: 25,
  AI_KEY_POINTS_COUNT: 3,
  AI_LONG_WORD_LENGTH: 6,
  AI_DIFFICULTY_BIAS: {
    strict: 10,
    logical: 5,
    simple: 0,
  },
  AI_LENGTH_SCORE_FACTOR: 0.7,
  AI_LENGTH_SCORE_MAX: 70,
  AI_CLARITY_SCORE_MAX: 25,
  AI_CLARITY_SCORE_FACTOR: 40,
  AI_BASE_SCORE_START: 40,
  
  // Session Configuration
  SESSION_MAX_AGE_MS: 7 * 24 * 60 * 60 * 1000,  // 7 days in milliseconds
  SESSION_MAX_AGE_DAYS: 7,
  ADMIN_SESSION_MAX_AGE_MS: 2 * 60 * 60 * 1000,  // 2 hours for admin
  
  // Cache Configuration
  CACHE_VERSION: 'v2',
  CACHE_STATIC_PREFIX: 'toinfinity-static',
  CACHE_DYNAMIC_PREFIX: 'toinfinity-dynamic',
  
  // Timeout Values (milliseconds)
  HEALTH_CHECK_TIMEOUT_MS: 3000,
  CLOUD_API_TIMEOUT_MS: 10000,
  DB_STATEMENT_TIMEOUT_MS: 5000,
  DB_QUERY_TIMEOUT_MS: 30000,
  HTTP_REQUEST_TIMEOUT_MS: 15000,
  
  // Pagination
  DEFAULT_PAGE_SIZE: 50,
  MAX_PAGE_SIZE: 100,
  
  // Retry Configuration
  MAX_RETRIES: 3,
  RETRY_DELAY_MS: 2000,
  
  // Database Pool
  DB_POOL_MAX_CONNECTIONS: 20,
  DB_POOL_IDLE_TIMEOUT_MS: 30000,
  DB_POOL_CONNECTION_TIMEOUT_MS: 5000,
  
  // Rate Limiting (future use)
  RATE_LIMIT_WINDOW_MS: 15 * 60 * 1000,  // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: 100,
  
  // File Upload (future use)
  MAX_FILE_SIZE_MB: 10,
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024,
};
