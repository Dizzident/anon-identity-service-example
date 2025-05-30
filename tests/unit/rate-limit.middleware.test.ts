import type { Request, Response, NextFunction } from 'express';
import rateLimitMiddleware from '../../src/middleware/rate-limit.middleware';
import CacheService from '../../src/services/cache.service';
import { RateLimitError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/services/cache.service');

describe('Rate Limit Middleware', () => {
  let mockCacheService: jest.Mocked<CacheService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockCacheService = {
      incrementRateLimit: jest.fn(),
      getRateLimit: jest.fn(),
      set: jest.fn(),
      get: jest.fn()
    } as any;

    // Mock the singleton instance
    (CacheService as any).mockImplementation(() => mockCacheService);

    mockRequest = {
      ip: '127.0.0.1',
      method: 'GET',
      path: '/test',
      headers: {
        'user-agent': 'Test Agent',
        'x-forwarded-for': undefined
      },
      sessionId: undefined
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      set: jest.fn()
    };

    mockNext = jest.fn();

    // Mock console methods
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('createRateLimitMiddleware', () => {
    it('should allow request within rate limit', async () => {
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        keyGenerator: (req) => `ip:${req.ip}`
      });

      mockCacheService.incrementRateLimit.mockResolvedValue(50);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith('ip:127.0.0.1', 60);
      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '100');
      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '50');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject request exceeding rate limit', async () => {
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        keyGenerator: (req) => `ip:${req.ip}`
      });

      mockCacheService.incrementRateLimit.mockResolvedValue(101);

      await expect(
        middleware(mockRequest as Request, mockResponse as Response, mockNext)
      ).rejects.toThrow(RateLimitError);

      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should use custom key generator', async () => {
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 50,
        keyGenerator: (req) => `session:${req.sessionId || 'anonymous'}`
      });

      mockRequest.sessionId = 'sess-123';
      mockCacheService.incrementRateLimit.mockResolvedValue(25);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith('session:sess-123', 60);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle cache service errors gracefully', async () => {
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        keyGenerator: (req) => `ip:${req.ip}`
      });

      mockCacheService.incrementRateLimit.mockRejectedValue(new Error('Cache error'));

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(console.warn).toHaveBeenCalledWith('Rate limiting error:', expect.any(Error));
      expect(mockNext).toHaveBeenCalledTimes(1); // Should allow request on error
    });

    it('should set rate limit headers correctly', async () => {
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 300000, // 5 minutes
        maxRequests: 200,
        keyGenerator: (req) => `ip:${req.ip}`
      });

      mockCacheService.incrementRateLimit.mockResolvedValue(75);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '200');
      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '125'); // 200 - 75
      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Reset', expect.any(String));
    });
  });

  describe('Built-in middleware functions', () => {
    describe('generalRateLimit', () => {
      it('should apply general rate limiting by IP', async () => {
        mockCacheService.incrementRateLimit.mockResolvedValue(80);

        await rateLimitMiddleware.generalRateLimit(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith(
          'general:127.0.0.1',
          900 // 15 minutes
        );
        expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '1000');
        expect(mockNext).toHaveBeenCalledTimes(1);
      });

      it('should use X-Forwarded-For header when available', async () => {
        mockRequest.headers!['x-forwarded-for'] = '192.168.1.100, 10.0.0.1';
        mockCacheService.incrementRateLimit.mockResolvedValue(50);

        await rateLimitMiddleware.generalRateLimit(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith(
          'general:192.168.1.100',
          900
        );
      });
    });

    describe('authRateLimit', () => {
      it('should apply authentication rate limiting', async () => {
        mockCacheService.incrementRateLimit.mockResolvedValue(15);

        await rateLimitMiddleware.authRateLimit(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith(
          'auth:127.0.0.1',
          300 // 5 minutes
        );
        expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '50');
        expect(mockNext).toHaveBeenCalledTimes(1);
      });

      it('should reject when auth rate limit exceeded', async () => {
        mockCacheService.incrementRateLimit.mockResolvedValue(51);

        await expect(
          rateLimitMiddleware.authRateLimit(
            mockRequest as Request,
            mockResponse as Response,
            mockNext
          )
        ).rejects.toThrow(RateLimitError);
      });
    });

    describe('verificationRateLimit', () => {
      it('should apply verification rate limiting', async () => {
        mockCacheService.incrementRateLimit.mockResolvedValue(8);

        await rateLimitMiddleware.verificationRateLimit(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith(
          'verification:127.0.0.1',
          600 // 10 minutes
        );
        expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '20');
        expect(mockNext).toHaveBeenCalledTimes(1);
      });
    });

    describe('sessionRateLimit', () => {
      it('should apply session rate limiting by sessionId when available', async () => {
        mockRequest.sessionId = 'sess-456';
        mockCacheService.incrementRateLimit.mockResolvedValue(25);

        await rateLimitMiddleware.sessionRateLimit(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith(
          'session:sess-456',
          3600 // 1 hour
        );
        expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Limit', '200');
        expect(mockNext).toHaveBeenCalledTimes(1);
      });

      it('should fall back to IP when sessionId not available', async () => {
        mockRequest.sessionId = undefined;
        mockCacheService.incrementRateLimit.mockResolvedValue(10);

        await rateLimitMiddleware.sessionRateLimit(
          mockRequest as Request,
          mockResponse as Response,
          mockNext
        );

        expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith(
          'session:ip:127.0.0.1',
          3600
        );
      });
    });
  });

  describe('getRateLimitStatus', () => {
    it('should return current rate limit status', async () => {
      mockCacheService.getRateLimit.mockImplementation((key) => {
        if (key === 'general:127.0.0.1') {
          return Promise.resolve(150);
        }
        if (key === 'auth:127.0.0.1') {
          return Promise.resolve(25);
        }
        if (key === 'verification:127.0.0.1') {
          return Promise.resolve(5);
        }
        if (key === 'session:sess-123') {
          return Promise.resolve(50);
        }
        return Promise.resolve(0);
      });

      mockRequest.sessionId = 'sess-123';

      const status = await rateLimitMiddleware.getRateLimitStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        rateLimits: {
          general: {
            current: 150,
            limit: 1000,
            remaining: 850,
            windowMs: 900000
          },
          auth: {
            current: 25,
            limit: 50,
            remaining: 25,
            windowMs: 300000
          },
          verification: {
            current: 5,
            limit: 20,
            remaining: 15,
            windowMs: 600000
          },
          session: {
            current: 50,
            limit: 200,
            remaining: 150,
            windowMs: 3600000
          }
        },
        ip: '127.0.0.1',
        sessionId: 'sess-123'
      });
    });

    it('should handle cache errors gracefully in status check', async () => {
      mockCacheService.getRateLimit.mockRejectedValue(new Error('Cache error'));

      await rateLimitMiddleware.getRateLimitStatus(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        rateLimits: {
          general: { current: 0, limit: 1000, remaining: 1000, windowMs: 900000 },
          auth: { current: 0, limit: 50, remaining: 50, windowMs: 300000 },
          verification: { current: 0, limit: 20, remaining: 20, windowMs: 600000 },
          session: { current: 0, limit: 200, remaining: 200, windowMs: 3600000 }
        },
        ip: '127.0.0.1',
        sessionId: undefined
      });
    });
  });

  describe('getClientIdentifier', () => {
    it('should extract IP from X-Forwarded-For header', () => {
      mockRequest.headers!['x-forwarded-for'] = '203.0.113.1, 198.51.100.1, 192.168.1.1';
      
      const identifier = (rateLimitMiddleware as any).getClientIdentifier(mockRequest);
      
      expect(identifier).toBe('203.0.113.1');
    });

    it('should handle X-Real-IP header', () => {
      mockRequest.headers!['x-real-ip'] = '203.0.113.2';
      
      const identifier = (rateLimitMiddleware as any).getClientIdentifier(mockRequest);
      
      expect(identifier).toBe('203.0.113.2');
    });

    it('should fall back to request IP', () => {
      const identifier = (rateLimitMiddleware as any).getClientIdentifier(mockRequest);
      
      expect(identifier).toBe('127.0.0.1');
    });

    it('should handle missing IP gracefully', () => {
      mockRequest.ip = undefined;
      
      const identifier = (rateLimitMiddleware as any).getClientIdentifier(mockRequest);
      
      expect(identifier).toBe('unknown');
    });
  });

  describe('Edge cases', () => {
    it('should handle undefined window calculation', async () => {
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 0, // Invalid window
        maxRequests: 100,
        keyGenerator: (req) => `test:${req.ip}`
      });

      mockCacheService.incrementRateLimit.mockResolvedValue(50);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockCacheService.incrementRateLimit).toHaveBeenCalledWith('test:127.0.0.1', 0);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle negative rate limit counts', async () => {
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        keyGenerator: (req) => `test:${req.ip}`
      });

      mockCacheService.incrementRateLimit.mockResolvedValue(-1);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.set).toHaveBeenCalledWith('X-RateLimit-Remaining', '101'); // maxRequests - (-1)
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should handle missing response object methods', async () => {
      const incompleteResponse = {} as Response;
      
      const middleware = rateLimitMiddleware.createRateLimitMiddleware({
        windowMs: 60000,
        maxRequests: 100,
        keyGenerator: (req) => `test:${req.ip}`
      });

      mockCacheService.incrementRateLimit.mockResolvedValue(50);

      await middleware(mockRequest as Request, incompleteResponse, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });
});