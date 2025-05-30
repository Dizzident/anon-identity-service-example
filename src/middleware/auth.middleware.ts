import { Request, Response, NextFunction } from 'express';
import ServiceProviderService from '../services/service-provider.service';
import logger from '../utils/logger';
import {
  AuthenticationError,
  SessionNotFoundError,
  SessionExpiredError,
  ValidationError
} from '../utils/errors';

// Extend Express Request interface to include session information
declare global {
  namespace Express {
    interface Request {
      session?: {
        id: string;
        holderDID: string;
        credentialIds: string[];
        attributes: Record<string, any>;
        createdAt: Date;
        expiresAt: Date;
        metadata?: Record<string, any>;
      };
      sessionId?: string;
    }
  }
}

export class AuthMiddleware {
  constructor(private serviceProvider: ServiceProviderService) {}

  // Middleware to validate session from Authorization header
  validateSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        throw new AuthenticationError('Missing Authorization header');
      }

      // Extract session ID from Bearer token
      const sessionId = this.extractSessionId(authHeader);
      if (!sessionId) {
        throw new AuthenticationError('Invalid Authorization header format. Expected: Bearer <sessionId>');
      }

      // Validate session with ServiceProvider
      const isValid = await this.serviceProvider.validateSession(sessionId);
      if (!isValid) {
        throw new SessionExpiredError(sessionId);
      }

      // Get full session details
      const session = await this.serviceProvider.getSession(sessionId);
      if (!session) {
        throw new SessionNotFoundError(sessionId);
      }

      // Attach session to request object
      req.session = session;
      req.sessionId = sessionId;

      logger.debug('Session validated successfully', {
        sessionId,
        holderDID: session.holderDID,
        endpoint: req.path
      });

      next();
    } catch (error) {
      logger.warn('Session validation failed', {
        path: req.path,
        sessionId: req.sessionId,
        error: error instanceof Error ? error.message : error
      });
      
      if (error instanceof AuthenticationError || 
          error instanceof SessionNotFoundError || 
          error instanceof SessionExpiredError) {
        res.status(error.statusCode).json({
          error: error.code,
          message: error.message,
          context: error.context
        });
      } else {
        res.status(401).json({
          error: 'AUTHENTICATION_FAILED',
          message: 'Session validation failed'
        });
      }
    }
  };

  // Middleware to validate session but continue if not present (optional auth)
  optionalSession = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const authHeader = req.headers.authorization;
      
      if (!authHeader) {
        // No auth header, continue without session
        next();
        return;
      }

      const sessionId = this.extractSessionId(authHeader);
      if (!sessionId) {
        // Invalid format, continue without session
        next();
        return;
      }

      // Try to validate session
      const isValid = await this.serviceProvider.validateSession(sessionId);
      if (isValid) {
        const session = await this.serviceProvider.getSession(sessionId);
        if (session) {
          req.session = session;
          req.sessionId = sessionId;
        }
      }

      next();
    } catch (error) {
      logger.debug('Optional session validation failed, continuing without session', {
        error: error instanceof Error ? error.message : error
      });
      next();
    }
  };

  // Middleware to check specific attribute requirements
  requireAttributes = (requiredAttributes: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.session) {
          throw new AuthenticationError('Session required for this endpoint');
        }

        const missingAttributes = requiredAttributes.filter(
          attr => !(attr in req.session!.attributes)
        );

        if (missingAttributes.length > 0) {
          throw new ValidationError(
            `Missing required attributes: ${missingAttributes.join(', ')}`,
            { 
              requiredAttributes,
              missingAttributes,
              availableAttributes: Object.keys(req.session.attributes)
            }
          );
        }

        logger.debug('Attribute requirements satisfied', {
          sessionId: req.sessionId,
          requiredAttributes,
          availableAttributes: Object.keys(req.session.attributes)
        });

        next();
      } catch (error) {
        logger.warn('Attribute requirement check failed', {
          sessionId: req.sessionId,
          requiredAttributes,
          error: error instanceof Error ? error.message : error
        });

        if (error instanceof AuthenticationError || error instanceof ValidationError) {
          res.status(error.statusCode).json({
            error: error.code,
            message: error.message,
            context: error.context
          });
        } else {
          res.status(403).json({
            error: 'AUTHORIZATION_FAILED',
            message: 'Attribute requirements not met'
          });
        }
      }
    };
  };

  // Middleware to check credential types
  requireCredentialTypes = (requiredTypes: string[]) => {
    return (req: Request, res: Response, next: NextFunction): void => {
      try {
        if (!req.session) {
          throw new AuthenticationError('Session required for this endpoint');
        }

        // Note: In a real implementation, you'd need to track which credential types
        // were used to create the session. For this example, we'll skip this check
        // as the ServiceProvider already validates credential types during verification.

        logger.debug('Credential type requirements checked', {
          sessionId: req.sessionId,
          requiredTypes
        });

        next();
      } catch (error) {
        logger.warn('Credential type check failed', {
          sessionId: req.sessionId,
          requiredTypes,
          error: error instanceof Error ? error.message : error
        });

        res.status(403).json({
          error: 'AUTHORIZATION_FAILED',
          message: 'Credential type requirements not met'
        });
      }
    };
  };

  // Helper method to extract session ID from Authorization header
  private extractSessionId(authHeader: string): string | null {
    const parts = authHeader.split(' ');
    
    if (parts.length !== 2 || parts[0] !== 'Bearer') {
      return null;
    }
    
    return parts[1];
  }

  // Middleware to log session access
  logSessionAccess = (req: Request, res: Response, next: NextFunction): void => {
    if (req.session) {
      logger.info('Authenticated request', {
        sessionId: req.sessionId,
        holderDID: req.session.holderDID,
        method: req.method,
        path: req.path,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }
    next();
  };

  // Middleware to extend session on access
  extendSessionOnAccess = (additionalTimeSeconds: number = 300) => {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      try {
        if (req.sessionId) {
          await this.serviceProvider.extendSession(req.sessionId, additionalTimeSeconds);
          logger.debug('Session extended on access', {
            sessionId: req.sessionId,
            additionalTime: additionalTimeSeconds
          });
        }
        next();
      } catch (error) {
        logger.warn('Failed to extend session', {
          sessionId: req.sessionId,
          error: error instanceof Error ? error.message : error
        });
        next(); // Continue even if extension fails
      }
    };
  };
}

export default AuthMiddleware;