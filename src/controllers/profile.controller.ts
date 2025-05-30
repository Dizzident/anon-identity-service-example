import { Request, Response } from 'express';
import CacheService from '../services/cache.service';
import serviceConfig from '../config/service.config';
import logger from '../utils/logger';
import { AuthenticationError, ValidationError } from '../utils/errors';
import { asyncHandler } from '../middleware/error.middleware';

export class ProfileController {
  constructor(private cacheService: CacheService) {}

  // Get user profile - requires basic profile verification
  getProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required for profile access');
    }

    const { session } = req;

    // Increment access counter
    await this.cacheService.incrementCounter('profile_access');

    logger.info('Profile accessed', {
      sessionId: session.id,
      holderDID: session.holderDID,
      attributeCount: Object.keys(session.attributes).length
    });

    // Return user profile based on verified attributes
    res.json({
      success: true,
      profile: {
        id: session.holderDID,
        attributes: session.attributes,
        verificationLevel: this.getVerificationLevel(session.attributes),
        sessionInfo: {
          sessionId: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          credentialIds: session.credentialIds
        }
      }
    });
  });

  // Get premium profile - requires premium subscription verification
  getPremiumProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required for premium profile access');
    }

    const { session } = req;

    // Check if user has premium subscription
    const subscriptionStatus = session.attributes.subscriptionStatus;
    if (!subscriptionStatus || !['premium', 'enterprise'].includes(subscriptionStatus)) {
      throw new AuthenticationError('Premium subscription required for this endpoint');
    }

    // Check subscription expiry if available
    const subscriptionExpiry = session.attributes.subscriptionExpiry;
    if (subscriptionExpiry && subscriptionExpiry < Date.now()) {
      throw new AuthenticationError('Subscription has expired');
    }

    await this.cacheService.incrementCounter('premium_profile_access');

    logger.info('Premium profile accessed', {
      sessionId: session.id,
      holderDID: session.holderDID,
      subscriptionStatus
    });

    res.json({
      success: true,
      profile: {
        id: session.holderDID,
        attributes: session.attributes,
        premiumFeatures: {
          subscriptionStatus,
          subscriptionExpiry: subscriptionExpiry ? new Date(subscriptionExpiry) : null,
          premiumServices: this.getPremiumServices(session.attributes)
        },
        verificationLevel: this.getVerificationLevel(session.attributes),
        sessionInfo: {
          sessionId: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt
        }
      }
    });
  });

  // Age verification endpoint
  verifyAge = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required for age verification');
    }

    const { session } = req;
    const { requiredAge } = req.query;

    let ageThreshold = 18; // Default
    if (requiredAge) {
      ageThreshold = parseInt(requiredAge as string);
      if (isNaN(ageThreshold) || ageThreshold < 13 || ageThreshold > 100) {
        throw new ValidationError('Invalid age threshold. Must be between 13 and 100');
      }
    }

    // Check age verification
    let ageVerified = false;
    let actualAge: number | undefined;

    if (session.attributes.age) {
      actualAge = session.attributes.age;
      ageVerified = actualAge >= ageThreshold;
    } else if (session.attributes.isOver18 && ageThreshold <= 18) {
      ageVerified = session.attributes.isOver18 === true;
    } else if (session.attributes.isOver21 && ageThreshold <= 21) {
      ageVerified = session.attributes.isOver21 === true;
    }

    await this.cacheService.incrementCounter('age_verifications');

    logger.info('Age verification performed', {
      sessionId: session.id,
      holderDID: session.holderDID,
      requiredAge: ageThreshold,
      verified: ageVerified,
      hasExactAge: !!actualAge
    });

    res.json({
      success: true,
      ageVerification: {
        verified: ageVerified,
        requiredAge: ageThreshold,
        hasExactAge: !!actualAge,
        // Only return exact age if explicitly disclosed
        ...(actualAge !== undefined && { actualAge })
      }
    });
  });

  // Financial services access - requires financial credentials
  getFinancialProfile = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required for financial services');
    }

    const { session } = req;

    // Check age requirement (21+)
    const isOver21 = session.attributes.isOver21;
    if (!isOver21) {
      throw new AuthenticationError('Must be over 21 for financial services');
    }

    // Check credit score if available
    const creditScore = session.attributes.creditScore;
    if (creditScore && creditScore < 600) {
      throw new AuthenticationError('Minimum credit score of 600 required');
    }

    await this.cacheService.incrementCounter('financial_profile_access');

    logger.info('Financial profile accessed', {
      sessionId: session.id,
      holderDID: session.holderDID,
      hasCreditScore: !!creditScore,
      hasIncome: !!session.attributes.income
    });

    res.json({
      success: true,
      financialProfile: {
        id: session.holderDID,
        qualifications: {
          ageVerified: isOver21,
          creditScoreVerified: !!creditScore,
          incomeVerified: !!session.attributes.income,
          creditScore: creditScore,
          ...(session.attributes.income && { 
            incomeRange: this.getIncomeRange(session.attributes.income) 
          })
        },
        availableServices: this.getFinancialServices(session.attributes),
        verificationLevel: this.getVerificationLevel(session.attributes)
      }
    });
  });

  // Get user preferences (from optional attributes)
  getPreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required');
    }

    const { session } = req;
    const preferences = session.attributes.preferences || {};

    res.json({
      success: true,
      preferences: {
        ...preferences,
        personalizedName: session.attributes.givenName,
        country: session.attributes.country,
        hasContact: !!(session.attributes.emailAddress || session.attributes.phoneNumber)
      }
    });
  });

  // Update user preferences (this would typically require re-verification)
  updatePreferences = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required');
    }

    // In a real implementation, updating preferences might require
    // a new credential issuance or presentation
    throw new ValidationError(
      'Preference updates require credential re-issuance. Contact your identity provider.'
    );
  });

  // Get session activity summary
  getActivitySummary = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required');
    }

    const { session } = req;
    const metadata = await this.cacheService.getCachedSessionMetadata(session.id);

    const activity = {
      sessionDuration: Date.now() - session.createdAt.getTime(),
      timeRemaining: session.expiresAt.getTime() - Date.now(),
      accessCount: metadata?.accessCount || 1,
      extensionCount: metadata?.extensionCount || 0,
      lastActivity: session.lastAccessedAt,
      endpointsAccessed: metadata?.endpointsAccessed || [],
      verificationMethod: metadata?.verificationMethod || 'unknown'
    };

    res.json({
      success: true,
      activity
    });
  });

  // Helper methods
  private getVerificationLevel(attributes: Record<string, any>): string {
    let level = 'basic';
    
    if (attributes.creditScore && attributes.income) {
      level = 'financial';
    } else if (attributes.subscriptionStatus) {
      level = 'premium';
    } else if (attributes.isOver18 || attributes.age) {
      level = 'verified';
    }

    return level;
  }

  private getPremiumServices(attributes: Record<string, any>): string[] {
    const services = ['Enhanced Profile', 'Priority Support'];
    
    if (attributes.subscriptionStatus === 'enterprise') {
      services.push('Enterprise API Access', 'Custom Integration', 'Dedicated Support');
    }
    
    return services;
  }

  private getFinancialServices(attributes: Record<string, any>): string[] {
    const services = ['Credit Monitoring', 'Financial Planning'];
    
    if (attributes.creditScore >= 700) {
      services.push('Premium Credit Products', 'Investment Services');
    }
    
    if (attributes.income >= 75000) {
      services.push('Private Banking', 'Wealth Management');
    }
    
    return services;
  }

  private getIncomeRange(income: number): string {
    if (income < 30000) return 'Under $30K';
    if (income < 50000) return '$30K - $50K';
    if (income < 75000) return '$50K - $75K';
    if (income < 100000) return '$75K - $100K';
    if (income < 150000) return '$100K - $150K';
    return 'Over $150K';
  }
}

export default ProfileController;