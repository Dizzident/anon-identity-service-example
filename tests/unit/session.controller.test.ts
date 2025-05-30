import { Request, Response } from 'express';
import SessionController from '../../src/controllers/session.controller';
import ServiceProviderService from '../../src/services/service-provider.service';
import CacheService from '../../src/services/cache.service';
import { 
  ValidationError, 
  SessionNotFoundError, 
  SessionExpiredError,
  AuthenticationError 
} from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/services/service-provider.service');
jest.mock('../../src/services/cache.service');

describe('SessionController', () => {
  let controller: SessionController;
  let mockServiceProvider: jest.Mocked<ServiceProviderService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServiceProvider = {
      createSessionFromVerification: jest.fn(),
      validateSession: jest.fn(),
      getSession: jest.fn(),
      extendSession: jest.fn(),
      invalidateSession: jest.fn()
    } as any;

    mockCacheService = {
      cacheSessionMetadata: jest.fn(),
      getCachedSessionMetadata: jest.fn(),
      delete: jest.fn()
    } as any;

    controller = new SessionController(mockServiceProvider, mockCacheService);

    mockRequest = {
      params: {},
      body: {},
      sessionId: undefined,
      session: undefined
    };

    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('createSession', () => {
    it('should create session successfully', async () => {
      const sessionData = {
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1', 'cred-2'],
        attributes: { age: 25, country: 'US' },
        expiresIn: 3600,
        metadata: { custom: 'data' }
      };

      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1', 'cred-2'],
        attributes: { age: 25, country: 'US' },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        expiresIn: 3600
      };

      mockRequest.body = sessionData;
      mockServiceProvider.createSessionFromVerification.mockResolvedValue(mockSession);
      mockCacheService.cacheSessionMetadata.mockResolvedValue(undefined);

      await controller.createSession(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.createSessionFromVerification).toHaveBeenCalledWith(
        {
          isValid: true,
          holderDID: 'did:test:holder',
          credentialIds: ['cred-1', 'cred-2'],
          disclosedAttributes: { age: 25, country: 'US' },
          verificationMethod: 'manual'
        },
        expect.objectContaining({
          custom: 'data',
          creationMethod: 'manual',
          timestamp: expect.any(Number)
        })
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        session: expect.objectContaining({
          id: 'session-123',
          holderDID: 'did:test:holder',
          expiresIn: 3600
        })
      });
    });

    it('should throw ValidationError for missing holderDID', async () => {
      mockRequest.body = {
        credentialIds: ['cred-1'],
        attributes: { age: 25 }
      };

      await expect(
        controller.createSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid credentialIds', async () => {
      mockRequest.body = {
        holderDID: 'did:test:holder',
        credentialIds: 'not-an-array',
        attributes: { age: 25 }
      };

      await expect(
        controller.createSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing attributes', async () => {
      mockRequest.body = {
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1']
      };

      await expect(
        controller.createSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('validateSession', () => {
    it('should validate session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        attributes: { age: 25 },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        metadata: { test: true }
      };

      const mockMetadata = { cached: 'data' };

      mockRequest.params = { id: 'session-123' };
      mockServiceProvider.validateSession.mockResolvedValue(true);
      mockServiceProvider.getSession.mockResolvedValue(mockSession);
      mockCacheService.getCachedSessionMetadata.mockResolvedValue(mockMetadata);

      await controller.validateSession(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.validateSession).toHaveBeenCalledWith('session-123');
      expect(mockServiceProvider.getSession).toHaveBeenCalledWith('session-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        valid: true,
        session: expect.objectContaining({
          id: 'session-123',
          holderDID: 'did:test:holder'
        }),
        cachedMetadata: mockMetadata
      });
    });

    it('should throw SessionExpiredError for invalid session', async () => {
      mockRequest.params = { id: 'session-123' };
      mockServiceProvider.validateSession.mockResolvedValue(false);

      await expect(
        controller.validateSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(SessionExpiredError);
    });

    it('should throw SessionNotFoundError when session does not exist', async () => {
      mockRequest.params = { id: 'session-123' };
      mockServiceProvider.validateSession.mockResolvedValue(true);
      mockServiceProvider.getSession.mockResolvedValue(null);

      await expect(
        controller.validateSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(SessionNotFoundError);
    });

    it('should throw ValidationError for missing session ID', async () => {
      mockRequest.params = {};

      await expect(
        controller.validateSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('extendSession', () => {
    it('should extend session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        expiresAt: new Date()
      };

      mockRequest.params = { id: 'session-123' };
      mockRequest.body = { additionalTime: 600 };
      mockServiceProvider.getSession.mockResolvedValue(mockSession);
      mockServiceProvider.extendSession.mockResolvedValue(true);
      mockCacheService.getCachedSessionMetadata.mockResolvedValue({ test: true });
      mockCacheService.cacheSessionMetadata.mockResolvedValue(undefined);

      await controller.extendSession(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.extendSession).toHaveBeenCalledWith('session-123', 600);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        sessionId: 'session-123',
        additionalTime: 600,
        newExpiresAt: expect.any(Date)
      });
    });

    it('should throw ValidationError for missing additionalTime', async () => {
      mockRequest.params = { id: 'session-123' };
      mockRequest.body = {};

      await expect(
        controller.extendSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for negative additionalTime', async () => {
      mockRequest.params = { id: 'session-123' };
      mockRequest.body = { additionalTime: -100 };

      await expect(
        controller.extendSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for excessive additionalTime', async () => {
      mockRequest.params = { id: 'session-123' };
      mockRequest.body = { additionalTime: 100000 }; // Exceeds max duration

      await expect(
        controller.extendSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw SessionNotFoundError when session does not exist', async () => {
      mockRequest.params = { id: 'session-123' };
      mockRequest.body = { additionalTime: 600 };
      mockServiceProvider.getSession.mockResolvedValue(null);

      await expect(
        controller.extendSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('invalidateSession', () => {
    it('should invalidate session successfully', async () => {
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder'
      };

      mockRequest.params = { id: 'session-123' };
      mockServiceProvider.getSession.mockResolvedValue(mockSession);
      mockServiceProvider.invalidateSession.mockResolvedValue(true);
      mockCacheService.delete.mockResolvedValue(true);

      await controller.invalidateSession(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.invalidateSession).toHaveBeenCalledWith('session-123');
      expect(mockCacheService.delete).toHaveBeenCalledWith('session:meta:session-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        sessionId: 'session-123',
        invalidatedAt: expect.any(String)
      });
    });

    it('should throw SessionNotFoundError when session does not exist', async () => {
      mockRequest.params = { id: 'session-123' };
      mockServiceProvider.getSession.mockResolvedValue(null);

      await expect(
        controller.invalidateSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(SessionNotFoundError);
    });

    it('should throw ValidationError when invalidation fails', async () => {
      const mockSession = { id: 'session-123', holderDID: 'did:test:holder' };
      mockRequest.params = { id: 'session-123' };
      mockServiceProvider.getSession.mockResolvedValue(mockSession);
      mockServiceProvider.invalidateSession.mockResolvedValue(false);

      await expect(
        controller.invalidateSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getSession', () => {
    it('should get session details successfully', async () => {
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        attributes: { age: 25 },
        createdAt: new Date(),
        expiresAt: new Date(),
        metadata: { test: true }
      };

      const mockMetadata = { cached: 'data' };

      mockRequest.params = { id: 'session-123' };
      mockRequest.sessionId = 'session-123'; // Same session
      mockServiceProvider.getSession.mockResolvedValue(mockSession);
      mockCacheService.getCachedSessionMetadata.mockResolvedValue(mockMetadata);

      await controller.getSession(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.getSession).toHaveBeenCalledWith('session-123');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        session: mockSession,
        cachedMetadata: mockMetadata
      });
    });

    it('should throw AuthenticationError when accessing other user session', async () => {
      mockRequest.params = { id: 'session-123' };
      mockRequest.sessionId = 'session-456'; // Different session

      await expect(
        controller.getSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should throw SessionNotFoundError when session does not exist', async () => {
      mockRequest.params = { id: 'session-123' };
      mockRequest.sessionId = 'session-123';
      mockServiceProvider.getSession.mockResolvedValue(null);

      await expect(
        controller.getSession(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(SessionNotFoundError);
    });
  });

  describe('listSessions', () => {
    it('should list sessions for current user', async () => {
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1', 'cred-2'],
        attributes: { age: 25, country: 'US' },
        createdAt: new Date(),
        expiresAt: new Date(),
        lastAccessedAt: new Date()
      };

      mockRequest.session = mockSession;

      await controller.listSessions(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        sessions: [
          {
            id: 'session-123',
            createdAt: mockSession.createdAt,
            expiresAt: mockSession.expiresAt,
            lastAccessedAt: mockSession.lastAccessedAt,
            credentialCount: 2,
            attributeCount: 2
          }
        ]
      });
    });

    it('should throw AuthenticationError when no session exists', async () => {
      mockRequest.session = undefined;

      await expect(
        controller.listSessions(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });
  });

  describe('getSessionActivity', () => {
    it('should get session activity successfully', async () => {
      const now = Date.now();
      const createdAt = new Date(now - 1800000); // 30 minutes ago
      const expiresAt = new Date(now + 1800000); // 30 minutes from now

      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        createdAt,
        expiresAt
      };

      const mockMetadata = {
        extensionCount: 2,
        lastExtended: now - 600000,
        creationMethod: 'verification',
        accessCount: 5
      };

      mockRequest.params = { id: 'session-123' };
      mockRequest.sessionId = 'session-123';
      mockServiceProvider.getSession.mockResolvedValue(mockSession);
      mockCacheService.getCachedSessionMetadata.mockResolvedValue(mockMetadata);

      await controller.getSessionActivity(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        sessionId: 'session-123',
        activity: {
          duration: expect.any(Number),
          timeToExpiry: expect.any(Number),
          isExpired: false,
          extensionCount: 2,
          lastExtended: mockMetadata.lastExtended,
          creationMethod: 'verification',
          accessCount: 5
        }
      });
    });

    it('should show expired status for expired sessions', async () => {
      const now = Date.now();
      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        createdAt: new Date(now - 7200000), // 2 hours ago
        expiresAt: new Date(now - 3600000)  // 1 hour ago (expired)
      };

      mockRequest.params = { id: 'session-123' };
      mockRequest.sessionId = 'session-123';
      mockServiceProvider.getSession.mockResolvedValue(mockSession);
      mockCacheService.getCachedSessionMetadata.mockResolvedValue({});

      await controller.getSessionActivity(mockRequest as Request, mockResponse as Response);

      const response = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(response.activity.isExpired).toBe(true);
      expect(response.activity.timeToExpiry).toBe(0);
    });

    it('should throw AuthenticationError when accessing other user session', async () => {
      mockRequest.params = { id: 'session-123' };
      mockRequest.sessionId = 'session-456';

      await expect(
        controller.getSessionActivity(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });
  });
});