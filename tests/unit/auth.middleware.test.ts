import type { Request, Response, NextFunction } from 'express';
import AuthMiddleware from '../../src/middleware/auth.middleware';
import type ServiceProviderService from '../../src/services/service-provider.service';
import {
  AuthenticationError,
  SessionNotFoundError,
  SessionExpiredError,
  ValidationError
} from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/services/service-provider.service');

describe('AuthMiddleware', () => {
  let authMiddleware: AuthMiddleware;
  let mockServiceProvider: jest.Mocked<ServiceProviderService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServiceProvider = {
      validateSession: jest.fn(),
      getSession: jest.fn(),
      extendSession: jest.fn()
    } as any;

    authMiddleware = new AuthMiddleware(mockServiceProvider);

    mockRequest = {
      headers: {},
      path: '/test',
      ip: '127.0.0.1'
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    mockNext = jest.fn();
  });

  describe('validateSession', () => {
    it('should validate session successfully and attach to request', async () => {
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        attributes: { age: 25, country: 'US' },
        createdAt: new Date(),
        expiresAt: new Date(),
        lastAccessedAt: new Date(),
        metadata: {}
      };

      mockRequest.headers = { authorization: 'Bearer session-123' };
      mockServiceProvider.validateSession.mockResolvedValue(true);
      mockServiceProvider.getSession.mockResolvedValue(mockSession);

      await authMiddleware.validateSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockServiceProvider.validateSession).toHaveBeenCalledWith('session-123');
      expect(mockServiceProvider.getSession).toHaveBeenCalledWith('session-123');
      expect(mockRequest.session).toEqual(mockSession);
      expect(mockRequest.sessionId).toBe('session-123');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should return 401 for missing Authorization header', async () => {
      mockRequest.headers = {};

      await authMiddleware.validateSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'AUTHENTICATION_ERROR',
        message: 'Missing Authorization header',
        context: {}
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid Authorization header format', async () => {
      mockRequest.headers = { authorization: 'Invalid header' };

      await authMiddleware.validateSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'AUTHENTICATION_ERROR',
        message: 'Invalid Authorization header format. Expected: Bearer <sessionId>',
        context: {}
      });
    });

    it('should return 401 for invalid session', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-session' };
      mockServiceProvider.validateSession.mockResolvedValue(false);

      await authMiddleware.validateSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'SESSION_EXPIRED',
          message: expect.stringContaining('Session has expired')
        })
      );
    });

    it('should return 404 when session not found', async () => {
      mockRequest.headers = { authorization: 'Bearer session-123' };
      mockServiceProvider.validateSession.mockResolvedValue(true);
      mockServiceProvider.getSession.mockResolvedValue(null);

      await authMiddleware.validateSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'SESSION_NOT_FOUND'
        })
      );
    });

    it('should handle service provider errors gracefully', async () => {
      mockRequest.headers = { authorization: 'Bearer session-123' };
      mockServiceProvider.validateSession.mockRejectedValue(new Error('Service error'));

      await authMiddleware.validateSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        error: 'AUTHENTICATION_FAILED',
        message: 'Session validation failed'
      });
    });
  });

  describe('optionalSession', () => {
    it('should attach session if valid authorization header provided', async () => {
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        attributes: { age: 25 }
      };

      mockRequest.headers = { authorization: 'Bearer session-123' };
      mockServiceProvider.validateSession.mockResolvedValue(true);
      mockServiceProvider.getSession.mockResolvedValue(mockSession);

      await authMiddleware.optionalSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.session).toEqual(mockSession);
      expect(mockRequest.sessionId).toBe('session-123');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should continue without session when no authorization header', async () => {
      mockRequest.headers = {};

      await authMiddleware.optionalSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.session).toBeUndefined();
      expect(mockRequest.sessionId).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should continue without session when authorization header is invalid', async () => {
      mockRequest.headers = { authorization: 'Invalid' };

      await authMiddleware.optionalSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.session).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should continue without session when validation fails', async () => {
      mockRequest.headers = { authorization: 'Bearer invalid-session' };
      mockServiceProvider.validateSession.mockResolvedValue(false);

      await authMiddleware.optionalSession(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockRequest.session).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('requireAttributes', () => {
    it('should pass when all required attributes are present', () => {
      const middleware = authMiddleware.requireAttributes(['age', 'country']);
      
      mockRequest.session = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        attributes: { age: 25, country: 'US', name: 'John' }
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should return 401 when session is missing', () => {
      const middleware = authMiddleware.requireAttributes(['age', 'country']);
      
      mockRequest.session = undefined;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'AUTHENTICATION_ERROR',
          message: 'Session required for this endpoint'
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 400 when required attributes are missing', () => {
      const middleware = authMiddleware.requireAttributes(['age', 'country', 'email']);
      
      mockRequest.session = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        attributes: { age: 25, name: 'John' } // missing country and email
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'VALIDATION_ERROR',
          message: 'Missing required attributes: country, email',
          context: expect.objectContaining({
            requiredAttributes: ['age', 'country', 'email'],
            missingAttributes: ['country', 'email'],
            availableAttributes: ['age', 'name']
          })
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', () => {
      const middleware = authMiddleware.requireAttributes(['age']);
      
      // Simulate an error by making attributes undefined
      mockRequest.session = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        attributes: undefined as any
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'AUTHORIZATION_FAILED',
          message: 'Attribute requirements not met'
        })
      );
    });
  });

  describe('requireCredentialTypes', () => {
    it('should pass when session is present', () => {
      const middleware = authMiddleware.requireCredentialTypes(['BasicProfileCredential']);
      
      mockRequest.session = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        attributes: { age: 25 }
      };

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should return 401 when session is missing', () => {
      const middleware = authMiddleware.requireCredentialTypes(['BasicProfileCredential']);
      
      mockRequest.session = undefined;

      middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'AUTHENTICATION_ERROR',
          message: 'Session required for this endpoint'
        })
      );
    });
  });

  describe('logSessionAccess', () => {
    it('should log access when session is present', () => {
      mockRequest.session = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        attributes: { age: 25 }
      };
      mockRequest.sessionId = 'session-123';
      mockRequest.method = 'GET';
      mockRequest.path = '/profile';
      mockRequest.get = jest.fn().mockReturnValue('Mozilla/5.0');
      mockRequest.ip = '192.168.1.1';

      authMiddleware.logSessionAccess(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should not log when session is not present', () => {
      mockRequest.session = undefined;

      authMiddleware.logSessionAccess(
        mockRequest as Request,
        mockResponse as Response,
        mockNext
      );

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('extendSessionOnAccess', () => {
    it('should extend session when sessionId is present', async () => {
      const middleware = authMiddleware.extendSessionOnAccess(300);
      
      mockRequest.sessionId = 'session-123';
      mockServiceProvider.extendSession.mockResolvedValue(true);

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockServiceProvider.extendSession).toHaveBeenCalledWith('session-123', 300);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should continue without extending when sessionId is not present', async () => {
      const middleware = authMiddleware.extendSessionOnAccess(300);
      
      mockRequest.sessionId = undefined;

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockServiceProvider.extendSession).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should continue even when extension fails', async () => {
      const middleware = authMiddleware.extendSessionOnAccess(300);
      
      mockRequest.sessionId = 'session-123';
      mockServiceProvider.extendSession.mockRejectedValue(new Error('Extension failed'));

      await middleware(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('extractSessionId', () => {
    it('should extract session ID from valid Bearer token', () => {
      const sessionId = (authMiddleware as any).extractSessionId('Bearer session-123');
      expect(sessionId).toBe('session-123');
    });

    it('should return null for invalid format', () => {
      const sessionId = (authMiddleware as any).extractSessionId('Invalid header');
      expect(sessionId).toBeNull();
    });

    it('should return null for missing Bearer prefix', () => {
      const sessionId = (authMiddleware as any).extractSessionId('session-123');
      expect(sessionId).toBeNull();
    });

    it('should return null for extra parts', () => {
      const sessionId = (authMiddleware as any).extractSessionId('Bearer session-123 extra');
      expect(sessionId).toBeNull();
    });
  });
});