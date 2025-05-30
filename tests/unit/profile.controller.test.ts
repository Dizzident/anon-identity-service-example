import type { Request, Response } from 'express';
import ProfileController from '../../src/controllers/profile.controller';
import type ServiceProviderService from '../../src/services/service-provider.service';
import type CacheService from '../../src/services/cache.service';
import { AuthenticationError, ValidationError } from '../../src/utils/errors';

// Mock dependencies
jest.mock('../../src/services/service-provider.service');
jest.mock('../../src/services/cache.service');

describe('ProfileController', () => {
  let controller: ProfileController;
  let mockServiceProvider: jest.Mocked<ServiceProviderService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockServiceProvider = {
      getSession: jest.fn(),
      validateSession: jest.fn()
    } as any;

    mockCacheService = {
      incrementCounter: jest.fn(),
      get: jest.fn(),
      set: jest.fn()
    } as any;

    controller = new ProfileController(mockServiceProvider, mockCacheService);

    mockRequest = {
      sessionId: 'session-123',
      session: {
        id: 'session-123',
        holderDID: 'did:test:holder',
        credentialIds: ['cred-1'],
        attributes: { 
          age: 25, 
          country: 'US',
          subscriptionLevel: 'premium',
          creditScore: 750
        },
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 3600000)
      },
      ip: '127.0.0.1',
      headers: {
        'user-agent': 'Test Agent'
      }
    };

    mockResponse = {
      json: jest.fn(),
      status: jest.fn().mockReturnThis()
    };
  });

  describe('getBasicProfile', () => {
    it('should return basic profile for authenticated user', async () => {
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getBasicProfile(mockRequest as Request, mockResponse as Response);

      expect(mockCacheService.incrementCounter).toHaveBeenCalledWith('profile_access');
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        profile: {
          type: 'basic_profile',
          verified: true,
          attributes: {
            ageVerified: true,
            countryVerified: true,
            age: 25,
            country: 'US'
          },
          access: {
            sessionId: 'session-123',
            timestamp: expect.any(String),
            ipAddress: '127.0.0.1',
            userAgent: 'Test Agent'
          },
          metadata: {
            credentialCount: 1,
            verificationLevel: 'standard'
          }
        }
      });
    });

    it('should throw AuthenticationError when session is missing', async () => {
      mockRequest.session = undefined;
      mockRequest.sessionId = undefined;

      await expect(
        controller.getBasicProfile(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(AuthenticationError);
    });

    it('should handle missing age attribute', async () => {
      mockRequest.session!.attributes = { country: 'US' };
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getBasicProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            attributes: expect.objectContaining({
              ageVerified: false,
              age: null
            })
          })
        })
      );
    });

    it('should handle missing country attribute', async () => {
      mockRequest.session!.attributes = { age: 25 };
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getBasicProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            attributes: expect.objectContaining({
              countryVerified: false,
              country: null
            })
          })
        })
      );
    });
  });

  describe('getPremiumProfile', () => {
    it('should return premium profile for user with subscription', async () => {
      mockCacheService.incrementCounter.mockResolvedValue(1);
      mockCacheService.get.mockResolvedValue(null);
      mockCacheService.set.mockResolvedValue(true);

      await controller.getPremiumProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        profile: {
          type: 'premium_profile',
          verified: true,
          subscription: {
            level: 'premium',
            verified: true,
            features: [
              'advanced_analytics',
              'priority_support',
              'extended_history',
              'api_access'
            ]
          },
          attributes: {
            age: 25,
            country: 'US',
            subscriptionLevel: 'premium'
          },
          access: {
            sessionId: 'session-123',
            timestamp: expect.any(String),
            ipAddress: '127.0.0.1',
            userAgent: 'Test Agent'
          },
          metadata: {
            credentialCount: 1,
            verificationLevel: 'premium',
            lastAccessed: expect.any(String)
          }
        }
      });
    });

    it('should throw ValidationError when subscription level is missing', async () => {
      mockRequest.session!.attributes = { age: 25, country: 'US' };

      await expect(
        controller.getPremiumProfile(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid subscription level', async () => {
      mockRequest.session!.attributes = { 
        age: 25, 
        country: 'US',
        subscriptionLevel: 'basic'
      };

      await expect(
        controller.getPremiumProfile(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle cached profile data', async () => {
      const cachedData = { lastAccessed: '2024-01-01T12:00:00Z' };
      mockCacheService.get.mockResolvedValue(cachedData);
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getPremiumProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          profile: expect.objectContaining({
            metadata: expect.objectContaining({
              lastAccessed: '2024-01-01T12:00:00Z'
            })
          })
        })
      );
    });
  });

  describe('getFinancialProfile', () => {
    it('should return financial profile for user with credit score', async () => {
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.getFinancialProfile(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        profile: {
          type: 'financial_profile',
          verified: true,
          financial: {
            creditScore: 750,
            creditTier: 'excellent',
            verified: true,
            riskLevel: 'low'
          },
          access: {
            sessionId: 'session-123',
            timestamp: expect.any(String),
            ipAddress: '127.0.0.1',
            userAgent: 'Test Agent'
          },
          metadata: {
            credentialCount: 1,
            verificationLevel: 'financial',
            sensitiveData: true
          }
        }
      });
    });

    it('should throw ValidationError when credit score is missing', async () => {
      mockRequest.session!.attributes = { age: 25, country: 'US' };

      await expect(
        controller.getFinancialProfile(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should throw ValidationError for invalid credit score', async () => {
      mockRequest.session!.attributes = { 
        age: 25, 
        country: 'US',
        creditScore: 500 // Below minimum of 600
      };

      await expect(
        controller.getFinancialProfile(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should classify credit tiers correctly', async () => {
      const testCases = [
        { score: 650, tier: 'fair' },
        { score: 700, tier: 'good' },
        { score: 750, tier: 'excellent' },
        { score: 850, tier: 'exceptional' }
      ];

      for (const testCase of testCases) {
        mockRequest.session!.attributes.creditScore = testCase.score;
        mockCacheService.incrementCounter.mockResolvedValue(1);

        await controller.getFinancialProfile(mockRequest as Request, mockResponse as Response);

        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            profile: expect.objectContaining({
              financial: expect.objectContaining({
                creditTier: testCase.tier
              })
            })
          })
        );

        jest.clearAllMocks();
      }
    });

    it('should determine risk levels correctly', async () => {
      const testCases = [
        { score: 650, risk: 'medium' },
        { score: 700, risk: 'low' },
        { score: 750, risk: 'low' }
      ];

      for (const testCase of testCases) {
        mockRequest.session!.attributes.creditScore = testCase.score;
        mockCacheService.incrementCounter.mockResolvedValue(1);

        await controller.getFinancialProfile(mockRequest as Request, mockResponse as Response);

        expect(mockResponse.json).toHaveBeenCalledWith(
          expect.objectContaining({
            profile: expect.objectContaining({
              financial: expect.objectContaining({
                riskLevel: testCase.risk
              })
            })
          })
        );

        jest.clearAllMocks();
      }
    });
  });

  describe('verifyAge', () => {
    it('should return age verification for user over 18', async () => {
      mockRequest.session!.attributes = { age: 25, isOver18: true };
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.verifyAge(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        verification: {
          type: 'age_verification',
          verified: true,
          isOver18: true,
          age: 25,
          verifiedAt: expect.any(String),
          access: {
            sessionId: 'session-123',
            timestamp: expect.any(String),
            ipAddress: '127.0.0.1'
          }
        }
      });
    });

    it('should return verification based on isOver18 flag when age not provided', async () => {
      mockRequest.session!.attributes = { isOver18: true, country: 'US' };
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.verifyAge(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: expect.objectContaining({
            verified: true,
            isOver18: true,
            age: null
          })
        })
      );
    });

    it('should return verification based on age when isOver18 not provided', async () => {
      mockRequest.session!.attributes = { age: 25, country: 'US' };
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.verifyAge(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: expect.objectContaining({
            verified: true,
            isOver18: true,
            age: 25
          })
        })
      );
    });

    it('should return unverified for user under 18', async () => {
      mockRequest.session!.attributes = { age: 16, isOver18: false };
      mockCacheService.incrementCounter.mockResolvedValue(1);

      await controller.verifyAge(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          verification: expect.objectContaining({
            verified: false,
            isOver18: false,
            age: 16
          })
        })
      );
    });

    it('should throw ValidationError when neither age nor isOver18 provided', async () => {
      mockRequest.session!.attributes = { country: 'US' };

      await expect(
        controller.verifyAge(mockRequest as Request, mockResponse as Response)
      ).rejects.toThrow(ValidationError);
    });

    it('should handle counter increment errors gracefully', async () => {
      mockRequest.session!.attributes = { age: 25, isOver18: true };
      mockCacheService.incrementCounter.mockRejectedValue(new Error('Counter failed'));

      await controller.verifyAge(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          verification: expect.objectContaining({
            verified: true
          })
        })
      );
    });
  });

  describe('helper methods', () => {
    describe('getCreditTier', () => {
      it('should classify credit scores correctly', () => {
        const testCases = [
          { score: 300, expected: 'poor' },
          { score: 580, expected: 'poor' },
          { score: 620, expected: 'fair' },
          { score: 680, expected: 'good' },
          { score: 740, expected: 'very_good' },
          { score: 800, expected: 'excellent' },
          { score: 850, expected: 'exceptional' }
        ];

        testCases.forEach(({ score, expected }) => {
          const tier = (controller as any).getCreditTier(score);
          expect(tier).toBe(expected);
        });
      });
    });

    describe('getRiskLevel', () => {
      it('should determine risk levels correctly', () => {
        const testCases = [
          { score: 500, expected: 'high' },
          { score: 650, expected: 'medium' },
          { score: 750, expected: 'low' }
        ];

        testCases.forEach(({ score, expected }) => {
          const risk = (controller as any).getRiskLevel(score);
          expect(risk).toBe(expected);
        });
      });
    });
  });
});