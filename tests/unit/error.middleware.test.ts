import type { Request, Response, NextFunction } from 'express';
import errorMiddleware from '../../src/middleware/error.middleware';
import {
  ValidationError,
  AuthenticationError,
  SessionNotFoundError,
  SessionExpiredError,
  InvalidPresentationError,
  RateLimitError
} from '../../src/utils/errors';

describe('Error Middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      method: 'POST',
      path: '/test-path',
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'Test Agent'
      }
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      locals: {}
    };

    mockNext = jest.fn();

    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('ValidationError handling', () => {
    it('should handle ValidationError with 400 status', () => {
      const error = new ValidationError('Invalid input data', { field: 'email' });

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'VALIDATION_ERROR',
        message: 'Invalid input data',
        context: { field: 'email' },
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });

    it('should handle ValidationError without context', () => {
      const error = new ValidationError('Required field missing');

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'VALIDATION_ERROR',
        message: 'Required field missing',
        context: {},
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });
  });

  describe('AuthenticationError handling', () => {
    it('should handle AuthenticationError with 401 status', () => {
      const error = new AuthenticationError('Invalid credentials', { userId: '123' });

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'AUTHENTICATION_ERROR',
        message: 'Invalid credentials',
        context: { userId: '123' },
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });
  });

  describe('SessionNotFoundError handling', () => {
    it('should handle SessionNotFoundError with 404 status', () => {
      const error = new SessionNotFoundError('Session not found', { sessionId: 'sess-123' });

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'SESSION_NOT_FOUND',
        message: 'Session not found',
        context: { sessionId: 'sess-123' },
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });
  });

  describe('SessionExpiredError handling', () => {
    it('should handle SessionExpiredError with 401 status', () => {
      const error = new SessionExpiredError('Session has expired', { 
        sessionId: 'sess-123',
        expiredAt: '2024-01-01T12:00:00Z'
      });

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'SESSION_EXPIRED',
        message: 'Session has expired',
        context: { 
          sessionId: 'sess-123',
          expiredAt: '2024-01-01T12:00:00Z'
        },
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });
  });

  describe('InvalidPresentationError handling', () => {
    it('should handle InvalidPresentationError with 400 status', () => {
      const error = new InvalidPresentationError('Invalid presentation format', { 
        reason: 'missing_proof' 
      });

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INVALID_PRESENTATION',
        message: 'Invalid presentation format',
        context: { reason: 'missing_proof' },
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });
  });

  describe('RateLimitError handling', () => {
    it('should handle RateLimitError with 429 status', () => {
      const error = new RateLimitError('Rate limit exceeded', { 
        limit: 100,
        current: 101,
        resetTime: '2024-01-01T13:00:00Z'
      });

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(429);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Rate limit exceeded',
        context: { 
          limit: 100,
          current: 101,
          resetTime: '2024-01-01T13:00:00Z'
        },
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });
  });

  describe('Generic Error handling', () => {
    it('should handle generic Error with 500 status in production', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const error = new Error('Database connection failed');

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred',
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle generic Error with detailed message in development', () => {
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      const error = new Error('Database connection failed');
      error.stack = 'Error: Database connection failed\n    at test.js:1:1';

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Database connection failed',
        stack: 'Error: Database connection failed\n    at test.js:1:1',
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });

      process.env.NODE_ENV = originalEnv;
    });

    it('should handle Error with custom status code', () => {
      const error = new Error('Forbidden access') as any;
      error.statusCode = 403;

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'INTERNAL_SERVER_ERROR',
          message: expect.any(String)
        })
      );
    });
  });

  describe('Logging behavior', () => {
    it('should log error details for 500 errors', () => {
      const error = new Error('Critical system failure');

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(console.error).toHaveBeenCalledWith(
        'Error occurred:',
        expect.objectContaining({
          message: 'Critical system failure',
          path: '/test-path',
          method: 'POST',
          ip: '127.0.0.1',
          userAgent: 'Test Agent'
        })
      );
    });

    it('should log warning for client errors (4xx)', () => {
      const error = new ValidationError('Invalid input');

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(console.warn).toHaveBeenCalledWith(
        'Client error:',
        expect.objectContaining({
          error: 'VALIDATION_ERROR',
          message: 'Invalid input',
          path: '/test-path'
        })
      );
    });

    it('should include request ID if available', () => {
      mockRequest.headers = { 
        'x-request-id': 'req-123',
        'user-agent': 'Test Agent'
      };
      const error = new ValidationError('Test error');

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(console.warn).toHaveBeenCalledWith(
        'Client error:',
        expect.objectContaining({
          requestId: 'req-123'
        })
      );
    });
  });

  describe('Response building', () => {
    it('should include all standard fields in error response', () => {
      const error = new ValidationError('Test validation error');

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'VALIDATION_ERROR',
        message: 'Test validation error',
        context: {},
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });

    it('should include request ID in response if available', () => {
      mockRequest.headers = { 'x-request-id': 'req-456' };
      const error = new AuthenticationError('Auth failed');

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'AUTHENTICATION_ERROR',
        message: 'Auth failed',
        context: {},
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST',
        requestId: 'req-456'
      });
    });

    it('should format timestamps correctly', () => {
      const error = new ValidationError('Test error');
      const beforeCall = new Date().toISOString();

      errorMiddleware(error, mockRequest as Request, mockResponse as Response, mockNext);

      const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
      const timestamp = response.timestamp;
      const afterCall = new Date().toISOString();

      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
      expect(timestamp).toBeGreaterThanOrEqual(beforeCall);
      expect(timestamp).toBeLessThanOrEqual(afterCall);
    });
  });

  describe('Edge cases', () => {
    it('should handle null error', () => {
      errorMiddleware(null as any, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred',
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });

    it('should handle undefined error', () => {
      errorMiddleware(undefined as any, mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'INTERNAL_SERVER_ERROR',
        message: 'An internal server error occurred',
        timestamp: expect.any(String),
        path: '/test-path',
        method: 'POST'
      });
    });

    it('should handle missing request properties', () => {
      const minimalRequest = {} as Request;
      const minimalResponse = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      } as Partial<Response>;

      const error = new ValidationError('Test error');

      errorMiddleware(error, minimalRequest, minimalResponse as Response, mockNext);

      expect(minimalResponse.json).toHaveBeenCalledWith({
        error: 'VALIDATION_ERROR',
        message: 'Test error',
        context: {},
        timestamp: expect.any(String),
        path: undefined,
        method: undefined
      });
    });
  });
});