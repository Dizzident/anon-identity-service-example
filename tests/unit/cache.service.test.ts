import CacheService from '../../src/services/cache.service';
import Redis from 'ioredis';

// Mock ioredis
jest.mock('ioredis');

describe('CacheService', () => {
  let cacheService: CacheService;
  let mockRedis: jest.Mocked<Redis>;

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Create mock Redis instance
    mockRedis = {
      on: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      get: jest.fn(),
      set: jest.fn(),
      setex: jest.fn(),
      del: jest.fn(),
      exists: jest.fn(),
      incr: jest.fn(),
      incrby: jest.fn(),
      expire: jest.fn(),
      ttl: jest.fn(),
      keys: jest.fn(),
      ping: jest.fn()
    } as any;

    (Redis as jest.MockedClass<typeof Redis>).mockImplementation(() => mockRedis);
    
    cacheService = new CacheService();
  });

  afterEach(async () => {
    await cacheService.disconnect();
  });

  describe('constructor', () => {
    it('should initialize Redis with correct configuration', () => {
      expect(Redis).toHaveBeenCalledWith({
        host: 'localhost',
        port: 6379,
        password: undefined,
        db: 0,
        retryDelayOnFailover: 100,
        enableReadyCheck: true,
        maxRetriesPerRequest: 3,
        lazyConnect: true
      });
    });

    it('should set up event handlers', () => {
      expect(mockRedis.on).toHaveBeenCalledWith('connect', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('ready', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('error', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('close', expect.any(Function));
      expect(mockRedis.on).toHaveBeenCalledWith('reconnecting', expect.any(Function));
    });
  });

  describe('connect', () => {
    it('should connect to Redis successfully', async () => {
      mockRedis.connect.mockResolvedValue(undefined);

      await cacheService.connect();

      expect(mockRedis.connect).toHaveBeenCalledTimes(1);
    });

    it('should throw error when connection fails', async () => {
      const error = new Error('Connection failed');
      mockRedis.connect.mockRejectedValue(error);

      await expect(cacheService.connect()).rejects.toThrow('Connection failed');
    });
  });

  describe('disconnect', () => {
    it('should disconnect from Redis successfully', async () => {
      mockRedis.disconnect.mockResolvedValue(undefined);

      await cacheService.disconnect();

      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
    });

    it('should handle disconnect errors gracefully', async () => {
      const error = new Error('Disconnect failed');
      mockRedis.disconnect.mockRejectedValue(error);

      // Should not throw
      await cacheService.disconnect();

      expect(mockRedis.disconnect).toHaveBeenCalledTimes(1);
    });
  });

  describe('get', () => {
    it('should get value from cache successfully', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedis.get.mockResolvedValue(JSON.stringify(testData));

      const result = await cacheService.get('test-key');

      expect(result).toEqual(testData);
      expect(mockRedis.get).toHaveBeenCalledWith('test-key');
    });

    it('should return null when key does not exist', async () => {
      mockRedis.get.mockResolvedValue(null);

      const result = await cacheService.get('nonexistent-key');

      expect(result).toBeNull();
    });

    it('should return null when Redis is not connected', async () => {
      // Simulate Redis not connected
      (cacheService as any).isConnected = false;

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
      expect(mockRedis.get).not.toHaveBeenCalled();
    });

    it('should handle JSON parse errors gracefully', async () => {
      mockRedis.get.mockResolvedValue('invalid-json');

      const result = await cacheService.get('test-key');

      expect(result).toBeNull();
    });
  });

  describe('set', () => {
    it('should set value in cache successfully', async () => {
      const testData = { name: 'test', value: 123 };
      mockRedis.set.mockResolvedValue('OK');

      const result = await cacheService.set('test-key', testData);

      expect(result).toBe(true);
      expect(mockRedis.set).toHaveBeenCalledWith('test-key', JSON.stringify(testData));
    });

    it('should set value with TTL', async () => {
      const testData = { name: 'test' };
      mockRedis.setex.mockResolvedValue('OK');

      const result = await cacheService.set('test-key', testData, 300);

      expect(result).toBe(true);
      expect(mockRedis.setex).toHaveBeenCalledWith('test-key', 300, JSON.stringify(testData));
    });

    it('should return false when Redis is not connected', async () => {
      (cacheService as any).isConnected = false;

      const result = await cacheService.set('test-key', { test: true });

      expect(result).toBe(false);
      expect(mockRedis.set).not.toHaveBeenCalled();
    });

    it('should handle Redis errors gracefully', async () => {
      mockRedis.set.mockRejectedValue(new Error('Redis error'));

      const result = await cacheService.set('test-key', { test: true });

      expect(result).toBe(false);
    });
  });

  describe('delete', () => {
    it('should delete key successfully', async () => {
      mockRedis.del.mockResolvedValue(1);

      const result = await cacheService.delete('test-key');

      expect(result).toBe(true);
      expect(mockRedis.del).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.del.mockResolvedValue(0);

      const result = await cacheService.delete('nonexistent-key');

      expect(result).toBe(false);
    });

    it('should return false when Redis is not connected', async () => {
      (cacheService as any).isConnected = false;

      const result = await cacheService.delete('test-key');

      expect(result).toBe(false);
    });
  });

  describe('exists', () => {
    it('should return true when key exists', async () => {
      mockRedis.exists.mockResolvedValue(1);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(true);
      expect(mockRedis.exists).toHaveBeenCalledWith('test-key');
    });

    it('should return false when key does not exist', async () => {
      mockRedis.exists.mockResolvedValue(0);

      const result = await cacheService.exists('test-key');

      expect(result).toBe(false);
    });

    it('should return false when Redis is not connected', async () => {
      (cacheService as any).isConnected = false;

      const result = await cacheService.exists('test-key');

      expect(result).toBe(false);
    });
  });

  describe('specialized cache methods', () => {
    describe('cacheDIDDocument', () => {
      it('should cache DID document with correct key', async () => {
        const document = { id: 'did:test:123', publicKey: [] };
        mockRedis.setex.mockResolvedValue('OK');

        await cacheService.cacheDIDDocument('did:test:123', document, 1800);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          'did:did:test:123',
          1800,
          JSON.stringify(document)
        );
      });
    });

    describe('getCachedDIDDocument', () => {
      it('should retrieve DID document with correct key', async () => {
        const document = { id: 'did:test:123', publicKey: [] };
        mockRedis.get.mockResolvedValue(JSON.stringify(document));

        const result = await cacheService.getCachedDIDDocument('did:test:123');

        expect(result).toEqual(document);
        expect(mockRedis.get).toHaveBeenCalledWith('did:did:test:123');
      });
    });

    describe('cacheRevocationList', () => {
      it('should cache revocation list with correct key', async () => {
        const revocationList = ['cred1', 'cred2', 'cred3'];
        mockRedis.setex.mockResolvedValue('OK');

        await cacheService.cacheRevocationList('did:issuer:123', revocationList, 600);

        expect(mockRedis.setex).toHaveBeenCalledWith(
          'revocation:did:issuer:123',
          600,
          JSON.stringify(revocationList)
        );
      });
    });
  });

  describe('rate limiting', () => {
    describe('incrementRateLimit', () => {
      it('should increment counter and set expiry for new key', async () => {
        mockRedis.incr.mockResolvedValue(1);
        mockRedis.expire.mockResolvedValue(1);

        const result = await cacheService.incrementRateLimit('user:123', 60);

        expect(result).toBe(1);
        expect(mockRedis.incr).toHaveBeenCalledWith('rate:user:123');
        expect(mockRedis.expire).toHaveBeenCalledWith('rate:user:123', 60);
      });

      it('should increment existing counter without setting expiry', async () => {
        mockRedis.incr.mockResolvedValue(5);

        const result = await cacheService.incrementRateLimit('user:123', 60);

        expect(result).toBe(5);
        expect(mockRedis.incr).toHaveBeenCalledWith('rate:user:123');
        expect(mockRedis.expire).not.toHaveBeenCalled();
      });

      it('should return 1 when Redis is not connected', async () => {
        (cacheService as any).isConnected = false;

        const result = await cacheService.incrementRateLimit('user:123', 60);

        expect(result).toBe(1);
      });
    });

    describe('getRateLimit', () => {
      it('should get current rate limit count', async () => {
        mockRedis.get.mockResolvedValue('5');

        const result = await cacheService.getRateLimit('user:123');

        expect(result).toBe(5);
        expect(mockRedis.get).toHaveBeenCalledWith('rate:user:123');
      });

      it('should return 0 when key does not exist', async () => {
        mockRedis.get.mockResolvedValue(null);

        const result = await cacheService.getRateLimit('user:123');

        expect(result).toBe(0);
      });
    });
  });

  describe('counters', () => {
    describe('incrementCounter', () => {
      it('should increment counter by specified amount', async () => {
        mockRedis.incrby.mockResolvedValue(15);

        const result = await cacheService.incrementCounter('verifications', 5);

        expect(result).toBe(15);
        expect(mockRedis.incrby).toHaveBeenCalledWith('counter:verifications', 5);
      });

      it('should increment counter by 1 by default', async () => {
        mockRedis.incrby.mockResolvedValue(1);

        const result = await cacheService.incrementCounter('sessions');

        expect(result).toBe(1);
        expect(mockRedis.incrby).toHaveBeenCalledWith('counter:sessions', 1);
      });
    });

    describe('getCounter', () => {
      it('should get counter value', async () => {
        mockRedis.get.mockResolvedValue('42');

        const result = await cacheService.getCounter('verifications');

        expect(result).toBe(42);
        expect(mockRedis.get).toHaveBeenCalledWith('counter:verifications');
      });

      it('should return 0 when counter does not exist', async () => {
        mockRedis.get.mockResolvedValue(null);

        const result = await cacheService.getCounter('nonexistent');

        expect(result).toBe(0);
      });
    });
  });

  describe('cleanup', () => {
    it('should clean up expired presentation requests', async () => {
      const expiredKeys = ['request:expired1', 'request:expired2'];
      mockRedis.keys.mockResolvedValue(['request:valid', 'request:expired1', 'request:expired2']);
      mockRedis.ttl.mockImplementation((key) => {
        if (expiredKeys.includes(key)) {
          return Promise.resolve(-1); // Expired
        }
        return Promise.resolve(300); // Valid
      });
      mockRedis.del.mockResolvedValue(2);

      await cacheService.cleanup();

      expect(mockRedis.keys).toHaveBeenCalledWith('request:*');
      expect(mockRedis.del).toHaveBeenCalledWith(...expiredKeys);
    });

    it('should handle cleanup errors gracefully', async () => {
      mockRedis.keys.mockRejectedValue(new Error('Redis error'));

      // Should not throw
      await expect(cacheService.cleanup()).resolves.not.toThrow();
    });
  });

  describe('healthCheck', () => {
    it('should return healthy status with latency', async () => {
      (cacheService as any).isConnected = true;
      mockRedis.ping.mockResolvedValue('PONG');

      const result = await cacheService.healthCheck();

      expect(result.connected).toBe(true);
      expect(typeof result.latency).toBe('number');
      expect(result.latency).toBeGreaterThanOrEqual(0);
    });

    it('should return unhealthy status when not connected', async () => {
      (cacheService as any).isConnected = false;

      const result = await cacheService.healthCheck();

      expect(result.connected).toBe(false);
      expect(result.latency).toBeUndefined();
    });

    it('should return unhealthy status when ping fails', async () => {
      (cacheService as any).isConnected = true;
      mockRedis.ping.mockRejectedValue(new Error('Ping failed'));

      const result = await cacheService.healthCheck();

      expect(result.connected).toBe(false);
      expect(result.latency).toBeUndefined();
    });
  });
});