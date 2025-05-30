import ServiceProviderService from '../../src/services/service-provider.service';
import { ValidationError, ServiceError } from '../../src/utils/errors';

// Mock anon-identity module
jest.mock('anon-identity', () => ({
  ServiceProvider: jest.fn().mockImplementation(() => ({
    createPresentationRequest: jest.fn(),
    validatePresentationAgainstRequest: jest.fn(),
    createSession: jest.fn(),
    batchVerifyPresentations: jest.fn(),
    batchCheckRevocations: jest.fn(),
    validateSession: jest.fn(),
    getSession: jest.fn(),
    extendSession: jest.fn(),
    invalidateSession: jest.fn(),
    getBatchStatistics: jest.fn()
  })),
  MemoryStorageProvider: jest.fn()
}));

describe('ServiceProviderService', () => {
  let serviceProvider: ServiceProviderService;

  beforeEach(() => {
    jest.clearAllMocks();
    serviceProvider = new ServiceProviderService();
  });

  describe('createPresentationRequest', () => {
    it('should create presentation request for valid endpoint', async () => {
      const mockRequest = {
        requestId: 'test-request-id',
        credentialTypes: ['BasicProfileCredential'],
        attributeConstraints: [],
        challenge: 'test-challenge',
        domain: 'localhost:3000',
        purpose: 'Access to /profile endpoint'
      };

      // Mock the ServiceProvider method
      const mockCreateRequest = jest.fn().mockResolvedValue(mockRequest);
      (serviceProvider as any).serviceProvider.createPresentationRequest = mockCreateRequest;

      const result = await serviceProvider.createPresentationRequest('/profile');

      expect(result).toEqual(mockRequest);
      expect(mockCreateRequest).toHaveBeenCalledWith(
        expect.objectContaining({
          credentialTypes: ['BasicProfileCredential'],
          purpose: 'Access to /profile endpoint'
        })
      );
    });

    it('should throw ValidationError for invalid endpoint', async () => {
      await expect(
        serviceProvider.createPresentationRequest('/invalid-endpoint')
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('verifyPresentationWithRequest', () => {
    it('should verify valid presentation successfully', async () => {
      const mockPresentation = { type: 'VerifiablePresentation' };
      const mockRequest = { requestId: 'test-request' };
      const mockResult = {
        isValid: true,
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        disclosedAttributes: { age: 25, country: 'US' }
      };

      const mockValidate = jest.fn().mockResolvedValue(mockResult);
      (serviceProvider as any).serviceProvider.validatePresentationAgainstRequest = mockValidate;

      const result = await serviceProvider.verifyPresentationWithRequest(
        mockPresentation as any,
        mockRequest as any
      );

      expect(result).toEqual(mockResult);
      expect(mockValidate).toHaveBeenCalledWith(mockPresentation, mockRequest);
    });

    it('should throw error for invalid presentation', async () => {
      const mockPresentation = { type: 'VerifiablePresentation' };
      const mockRequest = { requestId: 'test-request' };
      const mockResult = {
        isValid: false,
        errors: [{ code: 'INVALID_SIGNATURE', message: 'Invalid signature' }]
      };

      const mockValidate = jest.fn().mockResolvedValue(mockResult);
      (serviceProvider as any).serviceProvider.validatePresentationAgainstRequest = mockValidate;

      await expect(
        serviceProvider.verifyPresentationWithRequest(
          mockPresentation as any,
          mockRequest as any
        )
      ).rejects.toThrow();
    });
  });

  describe('createSessionFromVerification', () => {
    it('should create session successfully', async () => {
      const mockVerificationResult = {
        isValid: true,
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        disclosedAttributes: { age: 25, country: 'US' }
      };

      const mockSession = {
        id: 'session-123',
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        attributes: { age: 25, country: 'US' },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000),
        expiresIn: 3600
      };

      const mockCreateSession = jest.fn().mockResolvedValue(mockSession);
      (serviceProvider as any).serviceProvider.createSession = mockCreateSession;

      const result = await serviceProvider.createSessionFromVerification(
        mockVerificationResult as any
      );

      expect(result).toEqual(mockSession);
      expect(mockCreateSession).toHaveBeenCalledWith(
        expect.objectContaining({
          holderDID: 'did:test:holder',
          credentialIds: ['cred-1'],
          attributes: { age: 25, country: 'US' }
        })
      );
    });
  });

  describe('batchVerifyPresentations', () => {
    it('should perform batch verification successfully', async () => {
      const mockPresentations = [
        { type: 'VerifiablePresentation' },
        { type: 'VerifiablePresentation' }
      ];

      const mockBatchResult = {
        total: 2,
        successful: 2,
        failed: 0,
        processingTimeMs: 150,
        results: []
      };

      const mockBatchVerify = jest.fn().mockResolvedValue(mockBatchResult);
      (serviceProvider as any).serviceProvider.batchVerifyPresentations = mockBatchVerify;

      const result = await serviceProvider.batchVerifyPresentations(mockPresentations as any);

      expect(result).toEqual(mockBatchResult);
      expect(mockBatchVerify).toHaveBeenCalledWith(
        mockPresentations,
        expect.any(Object)
      );
    });
  });

  describe('batchCheckRevocations', () => {
    it('should perform batch revocation check successfully', async () => {
      const credentialIds = ['cred-1', 'cred-2', 'cred-3'];
      const mockResults = new Map([
        ['cred-1', false],
        ['cred-2', true],
        ['cred-3', false]
      ]);

      const mockBatchCheck = jest.fn().mockResolvedValue(mockResults);
      (serviceProvider as any).serviceProvider.batchCheckRevocations = mockBatchCheck;

      const result = await serviceProvider.batchCheckRevocations(credentialIds);

      expect(result).toEqual(mockResults);
      expect(mockBatchCheck).toHaveBeenCalledWith(credentialIds);
    });
  });

  describe('session management', () => {
    it('should validate session successfully', async () => {
      const sessionId = 'session-123';
      const mockValidate = jest.fn().mockResolvedValue(true);
      (serviceProvider as any).serviceProvider.validateSession = mockValidate;

      const result = await serviceProvider.validateSession(sessionId);

      expect(result).toBe(true);
      expect(mockValidate).toHaveBeenCalledWith(sessionId);
    });

    it('should get session successfully', async () => {
      const sessionId = 'session-123';
      const mockSession = {
        id: sessionId,
        holderDID: 'did:test:holder',
        attributes: { age: 25 }
      };

      const mockGetSession = jest.fn().mockResolvedValue(mockSession);
      (serviceProvider as any).serviceProvider.getSession = mockGetSession;

      const result = await serviceProvider.getSession(sessionId);

      expect(result).toEqual(mockSession);
      expect(mockGetSession).toHaveBeenCalledWith(sessionId);
    });

    it('should extend session successfully', async () => {
      const sessionId = 'session-123';
      const additionalTime = 300;
      const mockExtend = jest.fn().mockResolvedValue(true);
      (serviceProvider as any).serviceProvider.setSessionExpiry = mockExtend;

      const result = await serviceProvider.extendSession(sessionId, additionalTime);

      expect(result).toBe(true);
      expect(mockExtend).toHaveBeenCalledWith(sessionId, additionalTime);
    });

    it('should invalidate session successfully', async () => {
      const sessionId = 'session-123';
      const mockInvalidate = jest.fn().mockResolvedValue(true);
      (serviceProvider as any).serviceProvider.invalidateSession = mockInvalidate;

      const result = await serviceProvider.invalidateSession(sessionId);

      expect(result).toBe(true);
      expect(mockInvalidate).toHaveBeenCalledWith(sessionId);
    });
  });

  describe('error handling', () => {
    it('should handle service provider errors gracefully', async () => {
      const mockError = new Error('Service provider error');
      const mockValidate = jest.fn().mockRejectedValue(mockError);
      (serviceProvider as any).serviceProvider.validateSession = mockValidate;

      const result = await serviceProvider.validateSession('invalid-session');

      expect(result).toBe(false);
    });
  });

  describe('getServiceInfo', () => {
    it('should return service information', () => {
      const serviceInfo = serviceProvider.getServiceInfo();

      expect(serviceInfo).toHaveProperty('serviceDID');
      expect(serviceInfo).toHaveProperty('serviceName');
      expect(serviceInfo).toHaveProperty('trustedIssuers');
      expect(serviceInfo).toHaveProperty('endpoints');
      expect(serviceInfo).toHaveProperty('sessionConfig');
      expect(serviceInfo).toHaveProperty('batchConfig');

      expect(Array.isArray(serviceInfo.trustedIssuers)).toBe(true);
      expect(Array.isArray(serviceInfo.endpoints)).toBe(true);
    });
  });
});