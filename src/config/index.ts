import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

export const config = {
  // Server Configuration
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  apiBaseUrl: process.env.API_BASE_URL || 'http://localhost:3000',

  // Service Identity
  serviceDID: process.env.SERVICE_DID || 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  serviceName: process.env.SERVICE_NAME || 'Anonymous Identity Example Service',
  serviceDomain: process.env.SERVICE_DOMAIN || 'localhost:3000',

  // Redis Configuration
  redis: {
    url: process.env.REDIS_URL || 'redis://localhost:6379',
    password: process.env.REDIS_PASSWORD || undefined,
    db: parseInt(process.env.REDIS_DB || '0', 10)
  },

  // Session Configuration
  session: {
    defaultDuration: parseInt(process.env.SESSION_DEFAULT_DURATION || '3600', 10),
    maxDuration: parseInt(process.env.SESSION_MAX_DURATION || '86400', 10),
    cleanupInterval: parseInt(process.env.SESSION_CLEANUP_INTERVAL || '300', 10)
  },

  // Batch Processing Configuration
  batch: {
    maxConcurrency: parseInt(process.env.BATCH_MAX_CONCURRENCY || '10', 10),
    timeoutMs: parseInt(process.env.BATCH_TIMEOUT_MS || '15000', 10)
  },

  // Rate Limiting
  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '900000', 10), // 15 minutes
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
    batchMaxRequests: parseInt(process.env.RATE_LIMIT_BATCH_MAX_REQUESTS || '10', 10)
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    format: process.env.LOG_FORMAT || 'combined'
  },

  // CORS Configuration
  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: process.env.CORS_CREDENTIALS === 'true'
  },

  // Security
  security: {
    helmetEnabled: process.env.HELMET_ENABLED !== 'false',
    compressionEnabled: process.env.COMPRESSION_ENABLED !== 'false'
  },

  // Trusted Issuers
  trustedIssuers: process.env.TRUSTED_ISSUERS?.split(',') || [
    'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
    'did:key:z6MknGc3ocHs2rt5u8Kf3hX7vnbqvTJvJ4C3gXR2YsE8WqmX'
  ],

  // WebSocket Configuration
  websocket: {
    enabled: process.env.WEBSOCKET_ENABLED !== 'false',
    corsOrigin: process.env.WEBSOCKET_CORS_ORIGIN || '*'
  },

  // Error Handling
  errorHandling: {
    includeStackTrace: process.env.INCLUDE_STACK_TRACE === 'true' || process.env.NODE_ENV === 'development',
    logErrors: process.env.LOG_ERRORS !== 'false',
    maxErrorHistory: parseInt(process.env.MAX_ERROR_HISTORY || '1000', 10)
  },

  // Development helpers
  isDevelopment: process.env.NODE_ENV === 'development',
  isProduction: process.env.NODE_ENV === 'production',
  isTest: process.env.NODE_ENV === 'test'
};

export default config;