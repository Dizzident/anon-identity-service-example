import { Request, Response } from 'express';
import ServiceController from '../../src/controllers/service.controller';
import ServiceProviderService from '../../src/services/service-provider.service';
import CacheService from '../../src/services/cache.service';
import { ValidationError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/services/service-provider.service');
jest.mock('../../src/services/cache.service');

describe('ServiceController', () => {
  let controller: ServiceController;
  let mockServiceProvider: jest.Mocked<ServiceProviderService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServiceProvider = {
      getDIDDocument: jest.fn(),
      getTrustedIssuers: jest.fn(),
      getServiceEndpoints: jest.fn()
    } as any;

    mockCacheService = {
      healthCheck: jest.fn(),
      getCounter: jest.fn(),
      incrementCounter: jest.fn()
    } as any;

    controller = new ServiceController(mockServiceProvider, mockCacheService);

    mockRequest = {
      query: {},
      headers: {},
      ip: '127.0.0.1'
    };

    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getServiceInfo', () => {
    it('should return complete service information', async () => {
      const mockDIDDoc = {
        id: 'did:test:service',
        service: [
          {
            id: 'did:test:service#verification',
            type: 'VerificationService',
            serviceEndpoint: 'https://api.example.com'
          }
        ]
      };

      const mockTrustedIssuers = [
        'did:test:issuer1',
        'did:test:issuer2'
      ];

      const mockEndpoints = [
        '/profile',
        '/profile/premium',
        '/profile/financial'
      ];

      mockServiceProvider.getDIDDocument.mockResolvedValue(mockDIDDoc);
      mockServiceProvider.getTrustedIssuers.mockResolvedValue(mockTrustedIssuers);
      mockServiceProvider.getServiceEndpoints.mockResolvedValue(mockEndpoints);
      mockCacheService.getCounter.mockResolvedValue(150);

      await controller.getServiceInfo(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        service: {
          name: 'Anonymous Identity Verification Service',
          version: '1.0.0',
          description: 'A service for verifying W3C Verifiable Credentials with selective disclosure',
          did: 'did:test:service',
          endpoints: mockEndpoints,
          supportedCredentialTypes: [
            'BasicProfileCredential',
            'AgeVerificationCredential',
            'SubscriptionCredential',
            'CreditScoreCredential'
          ],
          capabilities: [
            'selective_disclosure',
            'batch_verification',
            'session_management',
            'real_time_updates'
          ],
          trustedIssuers: mockTrustedIssuers,
          statistics: {
            totalVerifications: 150
          }
        }
      });
    });

    it('should handle missing DID document gracefully', async () => {
      mockServiceProvider.getDIDDocument.mockResolvedValue(null);
      mockServiceProvider.getTrustedIssuers.mockResolvedValue([]);
      mockServiceProvider.getServiceEndpoints.mockResolvedValue([]);
      mockCacheService.getCounter.mockResolvedValue(0);

      await controller.getServiceInfo(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          service: expect.objectContaining({
            did: null
          })
        })
      );
    });

    it('should handle service provider errors gracefully', async () => {
      mockServiceProvider.getDIDDocument.mockRejectedValue(new Error('Service error'));
      mockServiceProvider.getTrustedIssuers.mockResolvedValue([]);
      mockServiceProvider.getServiceEndpoints.mockResolvedValue([]);
      mockCacheService.getCounter.mockResolvedValue(0);

      await controller.getServiceInfo(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          service: expect.objectContaining({
            did: null
          })
        })
      );
    });
  });

  describe('getRequirements', () => {
    it('should return requirements for profile endpoint', async () => {
      mockRequest.query = { endpoint: '/profile' };

      await controller.getRequirements(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        endpoint: '/profile',
        requirements: {
          credentialTypes: ['BasicProfileCredential'],
          attributeConstraints: [
            {
              name: 'age',
              required: true,
              type: 'number',
              minimum: 18
            },
            {
              name: 'country',
              required: true,
              type: 'string'
            }
          ],
          presentationConstraints: {
            limit_disclosure: 'required'
          }
        },
        description: 'Basic profile access requires age and country verification'
      });
    });

    it('should return requirements for premium profile endpoint', async () => {
      mockRequest.query = { endpoint: '/profile/premium' };

      await controller.getRequirements(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        endpoint: '/profile/premium',
        requirements: {
          credentialTypes: ['BasicProfileCredential', 'SubscriptionCredential'],
          attributeConstraints: [
            {
              name: 'age',
              required: true,
              type: 'number',
              minimum: 18
            },
            {
              name: 'subscriptionLevel',
              required: true,
              type: 'string',
              allowedValues: ['premium', 'enterprise']
            }
          ],
          presentationConstraints: {
            limit_disclosure: 'required'
          }
        },
        description: 'Premium profile access requires subscription verification'
      });
    });

    it('should return requirements for financial profile endpoint', async () => {
      mockRequest.query = { endpoint: '/profile/financial' };

      await controller.getRequirements(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        endpoint: '/profile/financial',
        requirements: {
          credentialTypes: ['CreditScoreCredential'],
          attributeConstraints: [
            {
              name: 'creditScore',
              required: true,
              type: 'number',
              minimum: 600
            }
          ],
          presentationConstraints: {
            limit_disclosure: 'required'
          }
        },
        description: 'Financial profile access requires credit score verification'
      });
    });

    it('should return requirements for age verification endpoint', async () => {
      mockRequest.query = { endpoint: '/profile/verify-age' };

      await controller.getRequirements(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        endpoint: '/profile/verify-age',
        requirements: {
          credentialTypes: ['AgeVerificationCredential'],
          attributeConstraints: [
            {
              name: 'isOver18',
              required: true,
              type: 'boolean',
              expectedValue: true
            }
          ],
          presentationConstraints: {
            limit_disclosure: 'required'
          }
        },
        description: 'Age verification endpoint for 18+ verification'
      });
    });

    it('should throw ValidationError for missing endpoint parameter', async () => {
      mockRequest.query = {};

      await expect(
        controller.getRequirements(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for unknown endpoint', async () => {
      mockRequest.query = { endpoint: '/unknown-endpoint' };

      await expect(
        controller.getRequirements(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle empty endpoint string', async () => {
      mockRequest.query = { endpoint: '' };

      await expect(
        controller.getRequirements(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('getTrustedIssuers', () => {
    it('should return list of trusted issuers', async () => {
      const mockIssuers = [
        'did:test:issuer1',
        'did:test:issuer2',
        'did:test:government-issuer'
      ];

      mockServiceProvider.getTrustedIssuers.mockResolvedValue(mockIssuers);

      await controller.getTrustedIssuers(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.getTrustedIssuers).toHaveBeenCalledTimes(1);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        trustedIssuers: mockIssuers,
        count: 3
      });
    });

    it('should handle empty trusted issuers list', async () => {
      mockServiceProvider.getTrustedIssuers.mockResolvedValue([]);

      await controller.getTrustedIssuers(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        trustedIssuers: [],
        count: 0
      });
    });

    it('should handle service provider errors', async () => {
      mockServiceProvider.getTrustedIssuers.mockRejectedValue(new Error('Service unavailable'));

      await expect(
        controller.getTrustedIssuers(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow('Service unavailable');
    });
  });

  describe('getHealth', () => {
    it('should return healthy status when all services are operational', async () => {
      const mockCacheHealth = {
        connected: true,
        latency: 5
      };

      mockCacheService.healthCheck.mockResolvedValue(mockCacheHealth);
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getHealth(mockRequest as Request, mockResponse as Response);

      expect(mockCacheService.healthCheck).toHaveBeenCalledTimes(1);
      expect(mockCacheService.incrementCounter).toHaveBeenCalledWith('health_checks');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        status: 'healthy',
        timestamp: expect.any(String),
        services: {
          api: {
            status: 'healthy',
            uptime: expect.any(Number)
          },
          cache: {
            status: 'healthy',
            connected: true,
            latency: 5
          },
          serviceProvider: {
            status: 'healthy'
          }
        },
        version: '1.0.0'
      });
    });

    it('should return degraded status when cache is unhealthy', async () => {
      const mockCacheHealth = {
        connected: false,
        latency: undefined
      };

      mockCacheService.healthCheck.mockResolvedValue(mockCacheHealth);
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getHealth(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'degraded',
          services: expect.objectContaining({
            cache: {
              status: 'unhealthy',
              connected: false,
              latency: undefined
            }
          })
        })
      );
    });

    it('should handle health check errors gracefully', async () => {
      mockCacheService.healthCheck.mockRejectedValue(new Error('Health check failed'));
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getHealth(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'degraded',
          services: expect.objectContaining({
            cache: {
              status: 'unhealthy',
              connected: false,
              error: 'Health check failed'
            }
          })
        })
      );
    });

    it('should handle counter increment errors', async () => {
      const mockCacheHealth = { connected: true, latency: 5 };
      mockCacheService.healthCheck.mockResolvedValue(mockCacheHealth);
      mockCacheService.incrementCounter.mockRejectedValue(new Error('Counter failed'));

      await controller.getHealth(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          status: 'healthy'
        })
      );
    });
  });

  describe('getEndpoints', () => {
    it('should return all available service endpoints', async () => {
      const mockEndpoints = [
        '/profile',
        '/profile/premium',
        '/profile/financial',
        '/profile/verify-age'
      ];

      mockServiceProvider.getServiceEndpoints.mockResolvedValue(mockEndpoints);

      await controller.getEndpoints(mockRequest as Request, mockResponse as Response);

      expect(mockServiceProvider.getServiceEndpoints).toHaveBeenCalledTimes(1);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        endpoints: mockEndpoints.map(endpoint => ({
          path: endpoint,
          method: 'GET',
          description: expect.any(String),
          requiresAuth: true
        })),
        count: mockEndpoints.length
      });
    });

    it('should handle empty endpoints list', async () => {
      mockServiceProvider.getServiceEndpoints.mockResolvedValue([]);

      await controller.getEndpoints(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        endpoints: [],
        count: 0
      });
    });

    it('should handle service provider errors', async () => {
      mockServiceProvider.getServiceEndpoints.mockRejectedValue(new Error('Endpoints unavailable'));

      await expect(
        controller.getEndpoints(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow('Endpoints unavailable');
    });
  });
});