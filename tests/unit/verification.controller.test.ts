import type { Request, Response } from 'express';
import VerificationController from '../../src/controllers/verification.controller';
import type ServiceProviderService from '../../src/services/service-provider.service';
import type CacheService from '../../src/services/cache.service';
import { ValidationError, InvalidPresentationError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/services/service-provider.service');
jest.mock('../../src/services/cache.service');

describe('VerificationController', () => {
  let controller: VerificationController;
  let mockServiceProvider: jest.Mocked<ServiceProviderService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    // Create mocks
    mockServiceProvider = {
      createPresentationRequest: jest.fn(),
      verifyPresentationWithRequest: jest.fn(),
      createSessionFromVerification: jest.fn(),
      batchVerifyPresentations: jest.fn(),
      batchCheckRevocations: jest.fn(),
      getBatchStatistics: jest.fn(),
      verifyPresentation: jest.fn()
    } as any;

    mockCacheService = {
      set: jest.fn(),
      get: jest.fn(),
      cachePresentationRequest: jest.fn(),
      getCachedPresentationRequest: jest.fn(),
      cacheSessionMetadata: jest.fn(),
      cacheBatchResult: jest.fn(),
      getCachedBatchResult: jest.fn()
    } as any;

    controller = new VerificationController(mockServiceProvider, mockCacheService);

    // Setup express mocks
    mockRequest = {
      query: {},
      body: {},
      params: {}
    };

    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getRequirements', () => {
    it('should return service requirements for valid endpoint', async () => {
      mockRequest.query = { endpoint: '/profile' };
      mockCacheService.set.mockResolvedValue(true);

      await controller.getRequirements(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceDID: expect.any(String),
          serviceName: expect.any(String),
          endpoint: '/profile',
          requestId: expect.any(String),
          requirements: expect.objectContaining({
            credentialTypes: expect.any(Array),
            attributeConstraints: expect.any(Array)
          }),
          challenge: expect.any(String),
          presentationEndpoint: '/auth/verify-presentation',
          expiresIn: 300
        })
      );
    });

    it('should throw ValidationError for missing endpoint', async () => {
      mockRequest.query = {};

      await expect(
        controller.getRequirements(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid endpoint', async () => {
      mockRequest.query = { endpoint: '/invalid-endpoint' };

      await expect(
        controller.getRequirements(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should cache challenge for later verification', async () => {
      mockRequest.query = { endpoint: '/profile' };
      mockCacheService.set.mockResolvedValue(true);

      await controller.getRequirements(mockRequest as Request, mockResponse as Response);

      expect(mockCacheService.set).toHaveBeenCalledWith(
        expect.stringMatching(/^challenge:/),
        expect.any(String),
        300
      );
    });
  });

  describe('createPresentationRequest', () => {
    it('should create presentation request successfully', async () => {
      const mockRequest = {
        requestId: 'test-request-id',
        credentialTypes: ['BasicProfileCredential'],
        challenge: 'test-challenge'
      };

      mockServiceProvider.createPresentationRequest.mockResolvedValue(mockRequest);
      mockCacheService.cachePresentationRequest.mockResolvedValue(undefined);

      mockRequest.body = { endpoint: '/profile', domain: 'example.com' };

      await controller.createPresentationRequest(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.createPresentationRequest).toHaveBeenCalledWith(
        '/profile',
        'example.com'
      );
      expect(mockCacheService.cachePresentationRequest).toHaveBeenCalledWith(
        'test-request-id',
        mockRequest,
        300
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        presentationRequest: mockRequest
      });
    });

    it('should throw ValidationError for missing endpoint', async () => {
      mockRequest.body = {};

      await expect(
        controller.createPresentationRequest(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('verifyPresentation', () => {
    it('should verify presentation with requestId successfully', async () => {
      const mockPresentation = { type: 'VerifiablePresentation' };
      const mockRequest = { requestId: 'test-request' };
      const mockVerificationResult = {
        isValid: true,
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        disclosedAttributes: { age: 25, country: 'US' }
      };
      const mockSession = {
        id: 'session-123',
        expiresIn: 3600
      };

      mockRequest.body = {
        presentation: mockPresentation,
        requestId: 'test-request',
        endpoint: '/profile'
      };

      mockCacheService.getCachedPresentationRequest.mockResolvedValue(mockRequest);
      mockServiceProvider.verifyPresentationWithRequest.mockResolvedValue(mockVerificationResult);
      mockServiceProvider.createSessionFromVerification.mockResolvedValue(mockSession);
      mockCacheService.cacheSessionMetadata.mockResolvedValue(undefined);

      await controller.verifyPresentation(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.verifyPresentationWithRequest).toHaveBeenCalledWith(
        mockPresentation,
        mockRequest
      );
      expect(mockServiceProvider.createSessionFromVerification).toHaveBeenCalledWith(
        mockVerificationResult,
        expect.objectContaining({
          endpoint: '/profile',
          requestId: 'test-request'
        })
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        sessionId: 'session-123',
        expiresIn: 3600,
        disclosureType: 'selective',
        verifiedAttributes: ['age', 'country']
      });
    });

    it('should verify presentation with endpoint (legacy) successfully', async () => {
      const mockPresentation = { type: 'VerifiablePresentation' };
      const mockLegacyResult = {
        type: 'selective_disclosure',
        attributes: { age: 25, country: 'US' },
        credentialId: 'cred-1',
        holderDID: 'did:test:holder'
      };
      const mockSession = { id: 'session-123', expiresIn: 3600 };

      mockRequest.body = {
        presentation: mockPresentation,
        endpoint: '/profile'
      };

      mockServiceProvider.verifyPresentation.mockResolvedValue(mockLegacyResult);
      mockServiceProvider.createSessionFromVerification.mockResolvedValue(mockSession);
      mockCacheService.cacheSessionMetadata.mockResolvedValue(undefined);

      await controller.verifyPresentation(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.verifyPresentation).toHaveBeenCalledWith(
        mockPresentation,
        '/profile'
      );
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        sessionId: 'session-123',
        expiresIn: 3600,
        disclosureType: 'selective',
        verifiedAttributes: ['age', 'country']
      });
    });

    it('should throw ValidationError for missing presentation', async () => {
      mockRequest.body = { endpoint: '/profile' };

      await expect(
        controller.verifyPresentation(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing endpoint and requestId', async () => {
      mockRequest.body = { presentation: { type: 'VerifiablePresentation' } };

      await expect(
        controller.verifyPresentation(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for expired presentation request', async () => {
      mockRequest.body = {
        presentation: { type: 'VerifiablePresentation' },
        requestId: 'expired-request'
      };

      mockCacheService.getCachedPresentationRequest.mockResolvedValue(null);

      await expect(
        controller.verifyPresentation(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('batchVerifyPresentations', () => {
    it('should perform batch verification successfully', async () => {
      const presentations = [
        { type: 'VerifiablePresentation' },
        { type: 'VerifiablePresentation' }
      ];
      const batchResult = {
        total: 2,
        successful: 2,
        failed: 0,
        processingTimeMs: 150
      };

      mockRequest.body = { presentations, options: {} };
      mockServiceProvider.batchVerifyPresentations.mockResolvedValue(batchResult);
      mockCacheService.cacheBatchResult.mockResolvedValue(undefined);

      await controller.batchVerifyPresentations(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.batchVerifyPresentations).toHaveBeenCalledWith(presentations);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        batchId: expect.any(String),
        results: batchResult,
        statistics: expect.objectContaining({
          total: 2,
          successful: 2,
          failed: 0,
          successRate: 100,
          processingTimeMs: 150,
          averageTimePerPresentation: 75
        })
      });
    });

    it('should throw ValidationError for missing presentations array', async () => {
      mockRequest.body = {};

      await expect(
        controller.batchVerifyPresentations(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty presentations array', async () => {
      mockRequest.body = { presentations: [] };

      await expect(
        controller.batchVerifyPresentations(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for too many presentations', async () => {
      const presentations = new Array(51).fill({ type: 'VerifiablePresentation' });
      mockRequest.body = { presentations };

      await expect(
        controller.batchVerifyPresentations(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('batchCheckRevocations', () => {
    it('should perform batch revocation check successfully', async () => {
      const credentialIds = ['cred1', 'cred2', 'cred3'];
      const revocationResults = new Map([
        ['cred1', false],
        ['cred2', true],
        ['cred3', false]
      ]);

      mockRequest.body = { credentialIds };
      mockServiceProvider.batchCheckRevocations.mockResolvedValue(revocationResults);

      await controller.batchCheckRevocations(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.batchCheckRevocations).toHaveBeenCalledWith(credentialIds);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        batchId: expect.any(String),
        results: {
          cred1: false,
          cred2: true,
          cred3: false
        },
        statistics: {
          total: 3,
          revoked: 1,
          valid: 2,
          revocationRate: 33.333333333333336
        }
      });
    });

    it('should throw ValidationError for missing credentialIds array', async () => {
      mockRequest.body = {};

      await expect(
        controller.batchCheckRevocations(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for empty credentialIds array', async () => {
      mockRequest.body = { credentialIds: [] };

      await expect(
        controller.batchCheckRevocations(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for too many credential IDs', async () => {
      const credentialIds = new Array(101).fill('credential-id');
      mockRequest.body = { credentialIds };

      await expect(
        controller.batchCheckRevocations(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getPresentationStatus', () => {
    it('should return batch result when ID exists in cache', async () => {
      const batchResult = { total: 5, successful: 5, failed: 0 };
      mockRequest.params = { id: 'batch-123' };
      mockCacheService.getCachedBatchResult.mockResolvedValue(batchResult);

      await controller.getPresentationStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        id: 'batch-123',
        type: 'batch_verification',
        status: 'completed',
        result: batchResult
      });
    });

    it('should return presentation request when ID exists in cache', async () => {
      const presentationRequest = { requestId: 'req-123', challenge: 'test' };
      mockRequest.params = { id: 'req-123' };
      mockCacheService.getCachedBatchResult.mockResolvedValue(null);
      mockCacheService.getCachedPresentationRequest.mockResolvedValue(presentationRequest);

      await controller.getPresentationStatus(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        id: 'req-123',
        type: 'presentation_request',
        status: 'pending',
        request: presentationRequest
      });
    });

    it('should throw ValidationError when ID not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      mockCacheService.getCachedBatchResult.mockResolvedValue(null);
      mockCacheService.getCachedPresentationRequest.mockResolvedValue(null);

      await expect(
        controller.getPresentationStatus(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for missing ID parameter', async () => {
      mockRequest.params = {};

      await expect(
        controller.getPresentationStatus(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getBatchStatistics', () => {
    it('should return batch statistics successfully', async () => {
      const mockStats = {
        totalVerifications: 100,
        averageProcessingTime: 75,
        successRate: 98.5
      };

      mockServiceProvider.getBatchStatistics.mockResolvedValue(mockStats);

      await controller.getBatchStatistics(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.getBatchStatistics).toHaveBeenCalledTimes(1);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        statistics: mockStats
      });
    });

    it('should handle errors when getting statistics fails', async () => {
      mockServiceProvider.getBatchStatistics.mockRejectedValue(new Error('Statistics unavailable'));

      await expect(
        controller.getBatchStatistics(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow('Statistics unavailable');
    });
  });
});