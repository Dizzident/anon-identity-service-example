import { Request, Response } from 'express';
import ServiceProviderService from '../services/service-provider.service';
import CacheService from '../services/cache.service';
import serviceConfig from '../config/service.config';
import logger from '../utils/logger';
import {
  ValidationError,
  SessionNotFoundError,
  SessionExpiredError,
  AuthenticationError
} from '../utils/errors';
import { asyncHandler } from '../middleware/error.middleware';

export class SessionController {
  constructor(
    private serviceProvider: ServiceProviderService,
    private cacheService: CacheService
  ) {}

  // Create session (typically called after presentation verification)
  createSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { 
      holderDID, 
      credentialIds, 
      attributes, 
      expiresIn, 
      metadata 
    } = req.body;

    if (!holderDID) {
      throw new ValidationError('HolderDID is required');
    }

    if (!credentialIds || !Array.isArray(credentialIds)) {
      throw new ValidationError('CredentialIds array is required');
    }

    if (!attributes || typeof attributes !== 'object') {
      throw new ValidationError('Attributes object is required');
    }

    try {
      const session = await this.serviceProvider.createSessionFromVerification(
        {
          isValid: true,
          holderDID,
          credentialIds,
          disclosedAttributes: attributes,
          verificationMethod: 'manual'
        },
        {
          ...metadata,
          creationMethod: 'manual',
          timestamp: Date.now()
        }
      );

      // Cache additional session metadata
      await this.cacheService.cacheSessionMetadata(
        session.id,
        {
          creationMethod: 'manual',
          requestedExpiresIn: expiresIn,
          ...metadata
        },
        session.expiresIn || serviceConfig.sessionConfig.defaultDuration
      );

      logger.info('Session created manually', {
        sessionId: session.id,
        holderDID,
        credentialIds,
        attributeCount: Object.keys(attributes).length
      });

      res.json({
        success: true,
        session: {
          id: session.id,
          holderDID: session.holderDID,
          credentialIds: session.credentialIds,
          attributes: session.attributes,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          expiresIn: session.expiresIn || serviceConfig.sessionConfig.defaultDuration
        }
      });
    } catch (error) {
      logger.error('Failed to create session manually', {
        holderDID,
        credentialIds,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Validate existing session
  validateSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Session ID is required');
    }

    try {
      const isValid = await this.serviceProvider.validateSession(id);
      
      if (!isValid) {
        throw new SessionExpiredError(id);
      }

      const session = await this.serviceProvider.getSession(id);
      if (!session) {
        throw new SessionNotFoundError(id);
      }

      // Get cached metadata
      const metadata = await this.cacheService.getCachedSessionMetadata(id);

      logger.debug('Session validated', {
        sessionId: id,
        holderDID: session.holderDID,
        expiresAt: session.expiresAt
      });

      res.json({
        success: true,
        valid: true,
        session: {
          id: session.id,
          holderDID: session.holderDID,
          credentialIds: session.credentialIds,
          attributes: session.attributes,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastAccessedAt: session.lastAccessedAt,
          metadata: session.metadata
        },
        cachedMetadata: metadata
      });
    } catch (error) {
      if (error instanceof SessionExpiredError || error instanceof SessionNotFoundError) {
        logger.warn('Session validation failed', {
          sessionId: id,
          error: error.message
        });
      } else {
        logger.error('Session validation error', {
          sessionId: id,
          error: error instanceof Error ? error.message : error
        });
      }
      throw error;
    }
  });

  // Extend session expiry
  extendSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;
    const { additionalTime } = req.body;

    if (!id) {
      throw new ValidationError('Session ID is required');
    }

    if (!additionalTime || typeof additionalTime !== 'number') {
      throw new ValidationError('AdditionalTime (in seconds) is required');
    }

    if (additionalTime <= 0) {
      throw new ValidationError('AdditionalTime must be positive');
    }

    if (additionalTime > serviceConfig.sessionConfig.maxDuration) {
      throw new ValidationError(
        `AdditionalTime cannot exceed maximum duration of ${serviceConfig.sessionConfig.maxDuration} seconds`
      );
    }

    try {
      const session = await this.serviceProvider.getSession(id);
      if (!session) {
        throw new SessionNotFoundError(id);
      }

      const success = await this.serviceProvider.extendSession(id, additionalTime);
      
      if (!success) {
        throw new ValidationError('Failed to extend session', { sessionId: id });
      }

      // Update cached metadata
      const metadata = await this.cacheService.getCachedSessionMetadata(id);
      if (metadata) {
        metadata.lastExtended = Date.now();
        metadata.extensionCount = (metadata.extensionCount || 0) + 1;
        await this.cacheService.cacheSessionMetadata(
          id,
          metadata,
          additionalTime
        );
      }

      logger.info('Session extended', {
        sessionId: id,
        additionalTime,
        holderDID: session.holderDID
      });

      res.json({
        success: true,
        sessionId: id,
        additionalTime,
        newExpiresAt: new Date(Date.now() + (additionalTime * 1000))
      });
    } catch (error) {
      logger.error('Failed to extend session', {
        sessionId: id,
        additionalTime,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Invalidate session
  invalidateSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Session ID is required');
    }

    try {
      const session = await this.serviceProvider.getSession(id);
      if (!session) {
        throw new SessionNotFoundError(id);
      }

      const success = await this.serviceProvider.invalidateSession(id);
      
      if (!success) {
        throw new ValidationError('Failed to invalidate session', { sessionId: id });
      }

      // Remove cached metadata
      await this.cacheService.delete(`session:meta:${id}`);

      logger.info('Session invalidated', {
        sessionId: id,
        holderDID: session.holderDID
      });

      res.json({
        success: true,
        sessionId: id,
        invalidatedAt: new Date().toISOString()
      });
    } catch (error) {
      logger.error('Failed to invalidate session', {
        sessionId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Get session details (protected endpoint)
  getSession = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Session ID is required');
    }

    // Check if the requesting session matches the requested session ID
    // or if the user has admin privileges (not implemented in this example)
    if (req.sessionId !== id) {
      throw new AuthenticationError('Cannot access other user sessions');
    }

    try {
      const session = await this.serviceProvider.getSession(id);
      if (!session) {
        throw new SessionNotFoundError(id);
      }

      const metadata = await this.cacheService.getCachedSessionMetadata(id);

      logger.debug('Session details retrieved', {
        sessionId: id,
        holderDID: session.holderDID
      });

      res.json({
        success: true,
        session: {
          id: session.id,
          holderDID: session.holderDID,
          credentialIds: session.credentialIds,
          attributes: session.attributes,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastAccessedAt: session.lastAccessedAt,
          metadata: session.metadata
        },
        cachedMetadata: metadata
      });
    } catch (error) {
      logger.error('Failed to get session details', {
        sessionId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // List active sessions for current user
  listSessions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    if (!req.session) {
      throw new AuthenticationError('Session required');
    }

    try {
      // In a real implementation, you would query sessions by holderDID
      // For this example, we'll just return the current session
      const sessions = [req.session];

      logger.debug('Sessions listed', {
        holderDID: req.session.holderDID,
        sessionCount: sessions.length
      });

      res.json({
        success: true,
        sessions: sessions.map(session => ({
          id: session.id,
          createdAt: session.createdAt,
          expiresAt: session.expiresAt,
          lastAccessedAt: session.lastAccessedAt,
          credentialCount: session.credentialIds.length,
          attributeCount: Object.keys(session.attributes).length
        }))
      });
    } catch (error) {
      logger.error('Failed to list sessions', {
        holderDID: req.session?.holderDID,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Get session activity/statistics
  getSessionActivity = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Session ID is required');
    }

    // Check permissions
    if (req.sessionId !== id) {
      throw new AuthenticationError('Cannot access other user session activity');
    }

    try {
      const session = await this.serviceProvider.getSession(id);
      if (!session) {
        throw new SessionNotFoundError(id);
      }

      const metadata = await this.cacheService.getCachedSessionMetadata(id);

      // Calculate session statistics
      const now = Date.now();
      const duration = now - session.createdAt.getTime();
      const timeToExpiry = session.expiresAt.getTime() - now;
      const isExpired = timeToExpiry <= 0;

      res.json({
        success: true,
        sessionId: id,
        activity: {
          duration: duration,
          timeToExpiry: Math.max(0, timeToExpiry),
          isExpired,
          extensionCount: metadata?.extensionCount || 0,
          lastExtended: metadata?.lastExtended,
          creationMethod: metadata?.creationMethod || 'unknown',
          accessCount: metadata?.accessCount || 1
        }
      });
    } catch (error) {
      logger.error('Failed to get session activity', {
        sessionId: id,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });
}

export default SessionController;