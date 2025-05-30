import rateLimit from 'express-rate-limit';
import { Request, Response } from 'express';
import { config } from '../config';
import logger from '../utils/logger';
import { rateLimitErrorHandler } from './error.middleware';

// Standard rate limiting for general endpoints
export const standardRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.maxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Use IP address as the key, but you could also use user ID or session ID
    return req.ip || 'unknown';
  },
  handler: rateLimitErrorHandler,
  onLimitReached: (req: Request) => {
    logger.warn('Rate limit reached', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
  }
});

// Stricter rate limiting for batch operations
export const batchRateLimit = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.batchMaxRequests,
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  handler: rateLimitErrorHandler,
  onLimitReached: (req: Request) => {
    logger.warn('Batch rate limit reached', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
  }
});

// Very strict rate limiting for presentation requests
export const presentationRequestRateLimit = rateLimit({
  windowMs: 60000, // 1 minute
  max: 10, // 10 requests per minute
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    return req.ip || 'unknown';
  },
  handler: rateLimitErrorHandler,
  onLimitReached: (req: Request) => {
    logger.warn('Presentation request rate limit reached', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
  }
});

// Rate limiting for session operations
export const sessionRateLimit = rateLimit({
  windowMs: 300000, // 5 minutes
  max: 50, // 50 session operations per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // For session operations, use the session ID if available, otherwise IP
    return (req as any).sessionId || req.ip || 'unknown';
  },
  handler: rateLimitErrorHandler,
  onLimitReached: (req: Request) => {
    logger.warn('Session rate limit reached', {
      sessionId: (req as any).sessionId,
      ip: req.ip,
      path: req.originalUrl,
      method: req.method
    });
  }
});

// Dynamic rate limiting based on endpoint
export const createDynamicRateLimit = (options: {
  windowMs?: number;
  max?: number;
  keyGenerator?: (req: Request) => string;
  skipIf?: (req: Request) => boolean;
}) => {
  return rateLimit({
    windowMs: options.windowMs || config.rateLimit.windowMs,
    max: options.max || config.rateLimit.maxRequests,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: options.keyGenerator || ((req: Request) => req.ip || 'unknown'),
    skip: options.skipIf || (() => false),
    handler: rateLimitErrorHandler,
    onLimitReached: (req: Request) => {
      logger.warn('Dynamic rate limit reached', {
        ip: req.ip,
        path: req.originalUrl,
        method: req.method,
        maxRequests: options.max,
        windowMs: options.windowMs
      });
    }
  });
};

// Rate limiting by credential ID for presentation verification
export const credentialBasedRateLimit = rateLimit({
  windowMs: 300000, // 5 minutes
  max: 20, // 20 verifications per credential per 5 minutes
  standardHeaders: true,
  legacyHeaders: false,
  keyGenerator: (req: Request): string => {
    // Extract credential ID from presentation if available
    try {
      const presentation = req.body.presentation;
      if (presentation && presentation.verifiableCredential) {
        const credential = Array.isArray(presentation.verifiableCredential) 
          ? presentation.verifiableCredential[0] 
          : presentation.verifiableCredential;
        return credential.id || req.ip || 'unknown';
      }
    } catch (error) {
      // Fall back to IP if we can't extract credential ID
    }
    return req.ip || 'unknown';
  },
  handler: rateLimitErrorHandler,
  onLimitReached: (req: Request) => {
    logger.warn('Credential-based rate limit reached', {
      ip: req.ip,
      path: req.originalUrl,
      method: req.method
    });
  }
});

// Skip rate limiting for certain conditions
export const skipRateLimitIf = (condition: (req: Request) => boolean) => {
  return (req: Request, res: Response): boolean => {
    try {
      const shouldSkip = condition(req);
      if (shouldSkip) {
        logger.debug('Rate limiting skipped', {
          ip: req.ip,
          path: req.originalUrl,
          method: req.method,
          reason: 'condition met'
        });
      }
      return shouldSkip;
    } catch (error) {
      logger.warn('Rate limit skip condition error', {
        error: error instanceof Error ? error.message : error,
        ip: req.ip,
        path: req.originalUrl
      });
      return false; // Don't skip on error
    }
  };
};

// Skip rate limiting for trusted IPs (if you have a whitelist)
export const skipForTrustedIPs = (trustedIPs: string[] = []) => {
  return skipRateLimitIf((req: Request) => {
    return trustedIPs.includes(req.ip || '');
  });
};

// Skip rate limiting for development environment
export const skipForDevelopment = skipRateLimitIf(() => {
  return config.isDevelopment;
});

// Combine multiple rate limiters
export const combineRateLimiters = (...limiters: any[]) => {
  return (req: Request, res: Response, next: any) => {
    let index = 0;
    
    const runNext = () => {
      if (index >= limiters.length) {
        return next();
      }
      
      const limiter = limiters[index++];
      limiter(req, res, runNext);
    };
    
    runNext();
  };
};

export default {
  standardRateLimit,
  batchRateLimit,
  presentationRequestRateLimit,
  sessionRateLimit,
  createDynamicRateLimit,
  credentialBasedRateLimit,
  skipRateLimitIf,
  skipForTrustedIPs,
  skipForDevelopment,
  combineRateLimiters
};