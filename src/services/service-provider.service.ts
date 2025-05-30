import { 
  MemoryStorageProvider,
  type VerifiablePresentation
} from 'anon-identity';
import ServiceProviderAdapter from './anon-identity-adapter';
import { v4 as uuidv4 } from 'uuid';
import crypto from 'crypto';
import serviceConfig from '../config/service.config';
import logger from '../utils/logger';
import {
  InvalidPresentationError,
  MissingAttributesError,
  createVerificationError,
  ValidationError,
  ServiceError
} from '../utils/errors';

export class ServiceProviderService {
  private serviceProvider: ServiceProviderAdapter;
  private serviceDID: string;
  private isInitialized: boolean = false;

  constructor() {
    this.serviceDID = serviceConfig.serviceDID;
    this.initializeServiceProvider();
  }

  private async initializeServiceProvider() {
    try {
      // Use memory storage for this example (in production, use Redis/File/Blockchain storage)
      const storage = new MemoryStorageProvider();
      
      // Initialize ServiceProvider with v1.0.5 enhanced features
      this.serviceProvider = new ServiceProviderAdapter(
        this.serviceDID,
        storage,
        serviceConfig.trustedIssuers,
        {
          sessionConfig: serviceConfig.sessionConfig,
          batchConfig: serviceConfig.batchConfig,
          errorConfig: serviceConfig.errorConfig
        }
      );
      
      this.isInitialized = true;
      logger.info('ServiceProvider initialized successfully', {
        serviceDID: this.serviceDID,
        trustedIssuers: serviceConfig.trustedIssuers.length,
        sessionConfig: serviceConfig.sessionConfig,
        batchConfig: serviceConfig.batchConfig
      });
    } catch (error) {
      logger.error('Failed to initialize ServiceProvider', { error });
      throw new ServiceError('Failed to initialize ServiceProvider', 500, 'INITIALIZATION_ERROR');
    }
  }

  private ensureInitialized() {
    if (!this.isInitialized) {
      throw new ServiceError('ServiceProvider not initialized', 500, 'NOT_INITIALIZED');
    }
  }

  // Create structured presentation request
  async createPresentationRequest(endpoint: string, domain?: string): Promise<any> {
    this.ensureInitialized();
    
    const requirements = serviceConfig.endpointRequirements[endpoint];
    if (!requirements) {
      throw new ValidationError(`No requirements defined for endpoint: ${endpoint}`, { endpoint });
    }
    
    try {
      const challenge = crypto.randomBytes(32).toString('hex');
      
      const request = await this.serviceProvider.createPresentationRequest({
        credentialTypes: requirements.credentialTypes,
        attributeConstraints: requirements.attributeConstraints,
        challenge,
        domain: domain || serviceConfig.serviceDomain,
        purpose: `Access to ${endpoint} endpoint`,
        requestId: uuidv4()
      });

      logger.info('Created presentation request', {
        endpoint,
        requestId: request.requestId,
        credentialTypes: requirements.credentialTypes,
        attributeConstraints: requirements.attributeConstraints.length
      });

      return request;
    } catch (error) {
      logger.error('Failed to create presentation request', { endpoint, error });
      throw new ServiceError(
        'Failed to create presentation request',
        500,
        'REQUEST_CREATION_ERROR',
        { endpoint, originalError: error }
      );
    }
  }

  // Verify presentation against structured request
  async verifyPresentationWithRequest(
    presentation: VerifiablePresentation,
    request: any
  ): Promise<any> {
    this.ensureInitialized();
    
    try {
      const result = await this.serviceProvider.validatePresentationAgainstRequest(
        presentation,
        request
      );
      
      if (!result.isValid) {
        logger.warn('Presentation verification failed', {
          requestId: request.requestId,
          errors: result.errors,
          holderDID: result.holderDID
        });
        
        // Convert anon-identity errors to our custom errors
        const customErrors = result.errors.map(error => 
          createVerificationError(error.code, error.message, error.context)
        );
        
        throw new InvalidPresentationError(result.errors, {
          requestId: request.requestId,
          holderDID: result.holderDID,
          customErrors
        });
      }
      
      logger.info('Presentation verified successfully', {
        requestId: request.requestId,
        holderDID: result.holderDID,
        credentialIds: result.credentialIds,
        disclosedAttributeCount: Object.keys(result.disclosedAttributes || {}).length
      });
      
      return result;
    } catch (error) {
      if (error instanceof InvalidPresentationError) {
        throw error;
      }
      
      logger.error('Presentation verification error', {
        requestId: request.requestId,
        error
      });
      
      throw new ServiceError(
        'Presentation verification failed',
        500,
        'VERIFICATION_ERROR',
        { requestId: request.requestId, originalError: error }
      );
    }
  }

  // Create session from verified presentation
  async createSessionFromVerification(
    verificationResult: any,
    metadata?: Record<string, any>
  ): Promise<any> {
    this.ensureInitialized();
    
    try {
      const session = await this.serviceProvider.createSession({
        holderDID: verificationResult.holderDID,
        credentialIds: verificationResult.credentialIds,
        attributes: verificationResult.disclosedAttributes || verificationResult.attributes,
        expiresIn: serviceConfig.sessionConfig.defaultDuration,
        metadata: {
          verifiedAt: Date.now(),
          verificationMethod: 'presentation',
          serviceDID: this.serviceDID,
          ...metadata
        }
      });
      
      logger.info('Session created successfully', {
        sessionId: session.id,
        holderDID: verificationResult.holderDID,
        credentialIds: verificationResult.credentialIds,
        expiresAt: session.expiresAt
      });
      
      return session;
    } catch (error) {
      logger.error('Failed to create session', {
        holderDID: verificationResult.holderDID,
        error
      });
      
      throw new ServiceError(
        'Failed to create session',
        500,
        'SESSION_CREATION_ERROR',
        { holderDID: verificationResult.holderDID, originalError: error }
      );
    }
  }

  // Batch verify multiple presentations
  async batchVerifyPresentations(
    presentations: VerifiablePresentation[]
  ): Promise<any> {
    this.ensureInitialized();
    
    try {
      logger.info('Starting batch verification', { 
        count: presentations.length,
        maxConcurrency: serviceConfig.batchConfig.maxConcurrency
      });
      
      const result = await this.serviceProvider.batchVerifyPresentations(
        presentations,
        serviceConfig.batchConfig
      );
      
      logger.info('Batch verification completed', {
        total: result.total,
        successful: result.successful,
        failed: result.failed,
        duration: result.processingTimeMs
      });
      
      return result;
    } catch (error) {
      logger.error('Batch verification failed', {
        presentationCount: presentations.length,
        error
      });
      
      throw new ServiceError(
        'Batch verification failed',
        500,
        'BATCH_VERIFICATION_ERROR',
        { presentationCount: presentations.length, originalError: error }
      );
    }
  }

  // Batch check revocation status
  async batchCheckRevocations(credentialIds: string[]): Promise<Map<string, boolean>> {
    this.ensureInitialized();
    
    try {
      logger.info('Starting batch revocation check', { count: credentialIds.length });
      
      const result = await this.serviceProvider.batchCheckRevocations(credentialIds);
      
      const revokedCount = Array.from(result.values()).filter(Boolean).length;
      logger.info('Batch revocation check completed', {
        total: credentialIds.length,
        revoked: revokedCount,
        valid: credentialIds.length - revokedCount
      });
      
      return result;
    } catch (error) {
      logger.error('Batch revocation check failed', {
        credentialCount: credentialIds.length,
        error
      });
      
      throw new ServiceError(
        'Batch revocation check failed',
        500,
        'BATCH_REVOCATION_ERROR',
        { credentialCount: credentialIds.length, originalError: error }
      );
    }
  }

  // Get batch processing statistics
  async getBatchStatistics() {
    this.ensureInitialized();
    
    try {
      const stats = await this.serviceProvider.getBatchStatistics();
      return stats;
    } catch (error) {
      logger.error('Failed to get batch statistics', { error });
      throw new ServiceError(
        'Failed to get batch statistics',
        500,
        'STATISTICS_ERROR',
        { originalError: error }
      );
    }
  }

  // Session management methods
  async validateSession(sessionId: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const isValid = await this.serviceProvider.validateSession(sessionId);
      logger.debug('Session validation result', { sessionId, isValid });
      return isValid;
    } catch (error) {
      logger.error('Session validation error', { sessionId, error });
      return false;
    }
  }

  async getSession(sessionId: string): Promise<any | null> {
    this.ensureInitialized();
    
    try {
      const session = await this.serviceProvider.getSession(sessionId);
      return session;
    } catch (error) {
      logger.error('Failed to get session', { sessionId, error });
      return null;
    }
  }

  async extendSession(sessionId: string, additionalTime: number): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const result = await this.serviceProvider.setSessionExpiry(sessionId, additionalTime);
      logger.info('Session extended', { sessionId, additionalTime });
      return result;
    } catch (error) {
      logger.error('Failed to extend session', { sessionId, additionalTime, error });
      return false;
    }
  }

  async invalidateSession(sessionId: string): Promise<boolean> {
    this.ensureInitialized();
    
    try {
      const result = await this.serviceProvider.invalidateSession(sessionId);
      logger.info('Session invalidated', { sessionId });
      return result;
    } catch (error) {
      logger.error('Failed to invalidate session', { sessionId, error });
      return false;
    }
  }

  // Legacy method for backward compatibility
  async verifyPresentation(
    presentation: VerifiablePresentation,
    endpoint: string
  ): Promise<{
    type: 'selective_disclosure' | 'full_disclosure';
    attributes: Record<string, any>;
    credentialId: string;
    holderDID: string;
  }> {
    const request = await this.createPresentationRequest(endpoint);
    const result = await this.verifyPresentationWithRequest(presentation, request);
    
    return {
      type: result.disclosedAttributes ? 'selective_disclosure' : 'full_disclosure',
      attributes: result.disclosedAttributes || result.attributes,
      credentialId: result.credentialIds[0],
      holderDID: result.holderDID
    };
  }

  // Get service information
  getServiceInfo() {
    return {
      serviceDID: this.serviceDID,
      serviceName: serviceConfig.serviceName,
      trustedIssuers: serviceConfig.trustedIssuers,
      endpoints: Object.keys(serviceConfig.endpointRequirements),
      sessionConfig: serviceConfig.sessionConfig,
      batchConfig: serviceConfig.batchConfig
    };
  }
}

export default ServiceProviderService;