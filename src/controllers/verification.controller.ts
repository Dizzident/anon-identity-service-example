import type { Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import type ServiceProviderService from '../services/service-provider.service';
import type CacheService from '../services/cache.service';
import serviceConfig from '../config/service.config';
import logger from '../utils/logger';
import {
  ValidationError,
  InvalidPresentationError
} from '../utils/errors';
import { asyncHandler } from '../middleware/error.middleware';

export class VerificationController {
  constructor(
    private serviceProvider: ServiceProviderService,
    private cacheService: CacheService
  ) {}

  // Get service requirements for an endpoint
  getRequirements = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { endpoint } = req.query;

    if (!endpoint || typeof endpoint !== 'string') {
      throw new ValidationError('Endpoint parameter is required', { providedEndpoint: endpoint });
    }

    const requirements = serviceConfig.endpointRequirements[endpoint];
    if (!requirements) {
      throw new ValidationError(`No requirements defined for endpoint: ${endpoint}`, { 
        endpoint, 
        availableEndpoints: Object.keys(serviceConfig.endpointRequirements) 
      });
    }

    const challenge = require('crypto').randomBytes(32).toString('hex');
    const requestId = uuidv4();

    // Cache the challenge for later verification
    await this.cacheService.set(`challenge:${requestId}`, challenge, 300); // 5 minutes

    const response = {
      serviceDID: serviceConfig.serviceDID,
      serviceName: serviceConfig.serviceName,
      endpoint,
      requestId,
      requirements: {
        credentialTypes: requirements.credentialTypes,
        attributeConstraints: requirements.attributeConstraints
      },
      attributeDescriptions: serviceConfig.attributeDescriptions,
      challenge,
      presentationEndpoint: '/auth/verify-presentation',
      expiresIn: 300 // 5 minutes
    };

    logger.info('Service requirements requested', {
      endpoint,
      requestId,
      credentialTypes: requirements.credentialTypes,
      constraintCount: requirements.attributeConstraints.length
    });

    res.json(response);
  });

  // Create structured presentation request
  createPresentationRequest = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { endpoint, domain } = req.body;

    if (!endpoint) {
      throw new ValidationError('Endpoint parameter is required');
    }

    try {
      const presentationRequest = await this.serviceProvider.createPresentationRequest(
        endpoint,
        domain
      );

      // Cache the presentation request for later validation
      await this.cacheService.cachePresentationRequest(
        presentationRequest.requestId,
        presentationRequest,
        300 // 5 minutes
      );

      logger.info('Presentation request created', {
        requestId: presentationRequest.requestId,
        endpoint,
        domain
      });

      res.json({
        success: true,
        presentationRequest
      });
    } catch (error) {
      logger.error('Failed to create presentation request', {
        endpoint,
        domain,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Verify a single presentation
  verifyPresentation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { presentation, endpoint, requestId } = req.body;

    if (!presentation) {
      throw new ValidationError('Presentation is required');
    }

    if (!endpoint && !requestId) {
      throw new ValidationError('Either endpoint or requestId is required');
    }

    try {
      let verificationResult;
      let sessionMetadata = { endpoint };

      if (requestId) {
        // Verify against a cached presentation request
        const cachedRequest = await this.cacheService.getCachedPresentationRequest(requestId);
        if (!cachedRequest) {
          throw new ValidationError('Presentation request not found or expired', { requestId });
        }

        verificationResult = await this.serviceProvider.verifyPresentationWithRequest(
          presentation,
          cachedRequest
        );

        sessionMetadata = { requestId, ...sessionMetadata };
      } else {
        // Legacy verification by endpoint
        const legacyResult = await this.serviceProvider.verifyPresentation(presentation, endpoint);
        verificationResult = {
          isValid: true,
          holderDID: legacyResult.holderDID,
          credentialIds: [legacyResult.credentialId],
          disclosedAttributes: legacyResult.attributes,
          verificationMethod: 'legacy'
        };
      }

      // Create session from verified presentation
      const session = await this.serviceProvider.createSessionFromVerification(
        verificationResult,
        sessionMetadata
      );

      // Cache session metadata
      await this.cacheService.cacheSessionMetadata(
        session.id,
        {
          endpoint,
          requestId,
          verificationTimestamp: Date.now(),
          disclosureType: verificationResult.disclosedAttributes ? 'selective' : 'full'
        },
        session.expiresIn || serviceConfig.sessionConfig.defaultDuration
      );

      logger.info('Presentation verified and session created', {
        sessionId: session.id,
        holderDID: verificationResult.holderDID,
        credentialIds: verificationResult.credentialIds,
        endpoint,
        requestId
      });

      res.json({
        success: true,
        sessionId: session.id,
        expiresIn: session.expiresIn || serviceConfig.sessionConfig.defaultDuration,
        disclosureType: verificationResult.disclosedAttributes ? 'selective' : 'full',
        verifiedAttributes: Object.keys(verificationResult.disclosedAttributes || verificationResult.attributes || {})
      });
    } catch (error) {
      logger.error('Presentation verification failed', {
        endpoint,
        requestId,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Batch verify multiple presentations
  batchVerifyPresentations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { presentations, options = {} } = req.body;

    if (!presentations || !Array.isArray(presentations)) {
      throw new ValidationError('Presentations array is required');
    }

    if (presentations.length === 0) {
      throw new ValidationError('At least one presentation is required');
    }

    if (presentations.length > 50) {
      throw new ValidationError('Maximum 50 presentations allowed per batch');
    }

    try {
      const batchId = uuidv4();
      
      logger.info('Starting batch verification', {
        batchId,
        count: presentations.length,
        options
      });

      const batchResult = await this.serviceProvider.batchVerifyPresentations(presentations);

      // Cache batch result
      await this.cacheService.cacheBatchResult(batchId, batchResult, 1800); // 30 minutes

      logger.info('Batch verification completed', {
        batchId,
        total: batchResult.total,
        successful: batchResult.successful,
        failed: batchResult.failed,
        duration: batchResult.processingTimeMs
      });

      res.json({
        success: true,
        batchId,
        results: batchResult,
        statistics: {
          total: batchResult.total,
          successful: batchResult.successful,
          failed: batchResult.failed,
          successRate: (batchResult.successful / batchResult.total) * 100,
          processingTimeMs: batchResult.processingTimeMs,
          averageTimePerPresentation: batchResult.processingTimeMs / batchResult.total
        }
      });
    } catch (error) {
      logger.error('Batch verification failed', {
        presentationCount: presentations.length,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Batch check revocation status
  batchCheckRevocations = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { credentialIds } = req.body;

    if (!credentialIds || !Array.isArray(credentialIds)) {
      throw new ValidationError('CredentialIds array is required');
    }

    if (credentialIds.length === 0) {
      throw new ValidationError('At least one credential ID is required');
    }

    if (credentialIds.length > 100) {
      throw new ValidationError('Maximum 100 credential IDs allowed per batch');
    }

    try {
      const batchId = uuidv4();

      logger.info('Starting batch revocation check', {
        batchId,
        count: credentialIds.length
      });

      const revocationResults = await this.serviceProvider.batchCheckRevocations(credentialIds);

      // Convert Map to object for JSON response
      const results: Record<string, boolean> = {};
      revocationResults.forEach((isRevoked, credentialId) => {
        results[credentialId] = isRevoked;
      });

      const revokedCount = Object.values(results).filter(Boolean).length;
      const validCount = credentialIds.length - revokedCount;

      logger.info('Batch revocation check completed', {
        batchId,
        total: credentialIds.length,
        revoked: revokedCount,
        valid: validCount
      });

      res.json({
        success: true,
        batchId,
        results,
        statistics: {
          total: credentialIds.length,
          revoked: revokedCount,
          valid: validCount,
          revocationRate: (revokedCount / credentialIds.length) * 100
        }
      });
    } catch (error) {
      logger.error('Batch revocation check failed', {
        credentialCount: credentialIds.length,
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });

  // Get presentation verification status
  getPresentationStatus = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { id } = req.params;

    if (!id) {
      throw new ValidationError('Presentation ID is required');
    }

    // In a real implementation, you would store presentation verification results
    // For this example, we'll check if there's a cached batch result
    const batchResult = await this.cacheService.getCachedBatchResult(id);

    if (batchResult) {
      res.json({
        id,
        type: 'batch_verification',
        status: 'completed',
        result: batchResult
      });
      return;
    }

    // Check if it's a cached presentation request
    const presentationRequest = await this.cacheService.getCachedPresentationRequest(id);

    if (presentationRequest) {
      res.json({
        id,
        type: 'presentation_request',
        status: 'pending',
        request: presentationRequest
      });
      return;
    }

    throw new ValidationError('Presentation or batch result not found', { id });
  });

  // Get batch processing statistics
  getBatchStatistics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      const statistics = await this.serviceProvider.getBatchStatistics();

      logger.debug('Batch statistics retrieved', { statistics });

      res.json({
        success: true,
        statistics
      });
    } catch (error) {
      logger.error('Failed to get batch statistics', {
        error: error instanceof Error ? error.message : error
      });
      throw error;
    }
  });
}

export default VerificationController;