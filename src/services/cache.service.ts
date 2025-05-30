import Redis from 'ioredis';
import { config } from '../config';
import logger from '../utils/logger';

export class CacheService {
  private redis: Redis;
  private isConnected: boolean = false;

  constructor() {
    this.redis = new Redis({
      host: config.redis.url.replace('redis://', '').split(':')[0],
      port: parseInt(config.redis.url.split(':')[2] || '6379'),
      password: config.redis.password,
      db: config.redis.db,
      retryDelayOnFailover: 100,
      enableReadyCheck: true,
      maxRetriesPerRequest: 3,
      lazyConnect: true
    });

    this.setupEventHandlers();
  }

  private setupEventHandlers() {
    this.redis.on('connect', () => {
      logger.info('Redis connection established');
      this.isConnected = true;
    });

    this.redis.on('ready', () => {
      logger.info('Redis ready to accept commands');
    });

    this.redis.on('error', (error) => {
      logger.error('Redis connection error', { error });
      this.isConnected = false;
    });

    this.redis.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
    });

    this.redis.on('reconnecting', () => {
      logger.info('Redis reconnecting...');
    });
  }

  async connect(): Promise<void> {
    try {
      await this.redis.connect();
    } catch (error) {
      logger.error('Failed to connect to Redis', { error });
      throw error;
    }
  }

  async disconnect(): Promise<void> {
    try {
      await this.redis.disconnect();
      this.isConnected = false;
    } catch (error) {
      logger.error('Failed to disconnect from Redis', { error });
    }
  }

  // Generic cache operations
  async get<T>(key: string): Promise<T | null> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache get', { key });
        return null;
      }

      const value = await this.redis.get(key);
      if (value === null) {
        return null;
      }

      return JSON.parse(value) as T;
    } catch (error) {
      logger.error('Cache get error', { key, error });
      return null;
    }
  }

  async set(key: string, value: any, ttlSeconds?: number): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache set', { key });
        return false;
      }

      const serialized = JSON.stringify(value);
      
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, serialized);
      } else {
        await this.redis.set(key, serialized);
      }

      return true;
    } catch (error) {
      logger.error('Cache set error', { key, error });
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        logger.warn('Redis not connected, skipping cache delete', { key });
        return false;
      }

      const result = await this.redis.del(key);
      return result > 0;
    } catch (error) {
      logger.error('Cache delete error', { key, error });
      return false;
    }
  }

  async exists(key: string): Promise<boolean> {
    try {
      if (!this.isConnected) {
        return false;
      }

      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      logger.error('Cache exists error', { key, error });
      return false;
    }
  }

  // Specialized cache methods for identity service

  // DID document caching
  async cacheDIDDocument(did: string, document: any, ttlSeconds: number = 3600): Promise<void> {
    const key = `did:${did}`;
    await this.set(key, document, ttlSeconds);
    logger.debug('Cached DID document', { did, ttl: ttlSeconds });
  }

  async getCachedDIDDocument(did: string): Promise<any | null> {
    const key = `did:${did}`;
    return await this.get(key);
  }

  // Revocation list caching
  async cacheRevocationList(issuerDID: string, revocationList: string[], ttlSeconds: number = 600): Promise<void> {
    const key = `revocation:${issuerDID}`;
    await this.set(key, revocationList, ttlSeconds);
    logger.debug('Cached revocation list', { issuerDID, count: revocationList.length, ttl: ttlSeconds });
  }

  async getCachedRevocationList(issuerDID: string): Promise<string[] | null> {
    const key = `revocation:${issuerDID}`;
    return await this.get(key);
  }

  // Session caching (supplementary to anon-identity's built-in session management)
  async cacheSessionMetadata(sessionId: string, metadata: any, ttlSeconds: number): Promise<void> {
    const key = `session:meta:${sessionId}`;
    await this.set(key, metadata, ttlSeconds);
  }

  async getCachedSessionMetadata(sessionId: string): Promise<any | null> {
    const key = `session:meta:${sessionId}`;
    return await this.get(key);
  }

  // Presentation request caching
  async cachePresentationRequest(requestId: string, request: any, ttlSeconds: number = 300): Promise<void> {
    const key = `request:${requestId}`;
    await this.set(key, request, ttlSeconds);
    logger.debug('Cached presentation request', { requestId, ttl: ttlSeconds });
  }

  async getCachedPresentationRequest(requestId: string): Promise<any | null> {
    const key = `request:${requestId}`;
    return await this.get(key);
  }

  // Batch operation results caching
  async cacheBatchResult(batchId: string, result: any, ttlSeconds: number = 1800): Promise<void> {
    const key = `batch:${batchId}`;
    await this.set(key, result, ttlSeconds);
    logger.debug('Cached batch result', { batchId, ttl: ttlSeconds });
  }

  async getCachedBatchResult(batchId: string): Promise<any | null> {
    const key = `batch:${batchId}`;
    return await this.get(key);
  }

  // Rate limiting support
  async incrementRateLimit(identifier: string, windowSeconds: number): Promise<number> {
    try {
      if (!this.isConnected) {
        return 1; // Allow request if cache unavailable
      }

      const key = `rate:${identifier}`;
      const count = await this.redis.incr(key);
      
      if (count === 1) {
        await this.redis.expire(key, windowSeconds);
      }
      
      return count;
    } catch (error) {
      logger.error('Rate limit increment error', { identifier, error });
      return 1; // Allow request on error
    }
  }

  async getRateLimit(identifier: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const key = `rate:${identifier}`;
      const count = await this.redis.get(key);
      return count ? parseInt(count) : 0;
    } catch (error) {
      logger.error('Rate limit get error', { identifier, error });
      return 0;
    }
  }

  // Analytics and statistics
  async incrementCounter(counterName: string, increment: number = 1): Promise<number> {
    try {
      if (!this.isConnected) {
        return increment;
      }

      const key = `counter:${counterName}`;
      return await this.redis.incrby(key, increment);
    } catch (error) {
      logger.error('Counter increment error', { counterName, error });
      return increment;
    }
  }

  async getCounter(counterName: string): Promise<number> {
    try {
      if (!this.isConnected) {
        return 0;
      }

      const key = `counter:${counterName}`;
      const value = await this.redis.get(key);
      return value ? parseInt(value) : 0;
    } catch (error) {
      logger.error('Counter get error', { counterName, error });
      return 0;
    }
  }

  // Cleanup operations
  async cleanup(): Promise<void> {
    try {
      if (!this.isConnected) {
        return;
      }

      // Clean up expired presentation requests
      const requestKeys = await this.redis.keys('request:*');
      const expiredRequests = [];
      
      for (const key of requestKeys) {
        const ttl = await this.redis.ttl(key);
        if (ttl === -1 || ttl === -2) { // No expiry or expired
          expiredRequests.push(key);
        }
      }
      
      if (expiredRequests.length > 0) {
        await this.redis.del(...expiredRequests);
        logger.info('Cleaned up expired presentation requests', { count: expiredRequests.length });
      }
    } catch (error) {
      logger.error('Cache cleanup error', { error });
    }
  }

  // Health check
  async healthCheck(): Promise<{ connected: boolean; latency?: number }> {
    try {
      if (!this.isConnected) {
        return { connected: false };
      }

      const start = Date.now();
      await this.redis.ping();
      const latency = Date.now() - start;

      return { connected: true, latency };
    } catch (error) {
      logger.error('Cache health check failed', { error });
      return { connected: false };
    }
  }
}

export default CacheService;