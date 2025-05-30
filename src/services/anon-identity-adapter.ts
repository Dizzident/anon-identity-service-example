/**
 * Adapter for anon-identity package to handle API differences
 * This file provides compatibility between our service and the actual anon-identity implementation
 */

import { 
  ServiceProvider as BaseServiceProvider,
  MemoryStorageProvider,
  type VerifiablePresentation
} from 'anon-identity';

// Mock implementations for methods that might not exist in the current version
export class ServiceProviderAdapter {
  private baseProvider: BaseServiceProvider;

  constructor(did: string, storage: any, trustedIssuers: string[], config?: any) {
    this.baseProvider = new BaseServiceProvider(did, storage, trustedIssuers);
  }

  async createPresentationRequest(options: any): Promise<any> {
    // If the method exists, use it; otherwise, create a mock implementation
    if (typeof (this.baseProvider as any).createPresentationRequest === 'function') {
      return (this.baseProvider as any).createPresentationRequest(options);
    }
    
    // Mock implementation
    return {
      requestId: require('crypto').randomBytes(16).toString('hex'),
      ...options
    };
  }

  async validatePresentationAgainstRequest(presentation: any, request: any): Promise<any> {
    // If the method exists, use it; otherwise, fall back to basic verification
    if (typeof (this.baseProvider as any).validatePresentationAgainstRequest === 'function') {
      return (this.baseProvider as any).validatePresentationAgainstRequest(presentation, request);
    }
    
    // Fallback to basic verification
    const result = await this.baseProvider.verifyPresentation(presentation);
    return {
      isValid: result.valid || false,
      holder: result.holder,
      holderDID: result.holder, // Alias
      credentials: result.credentials || [],
      credentialIds: (result.credentials || []).map((c: any) => c.id),
      attributes: result.credentials?.[0]?.credentialSubject || {},
      disclosedAttributes: result.credentials?.[0]?.credentialSubject || {},
      errors: result.errors || []
    };
  }

  async createSession(options: any): Promise<any> {
    // Mock session creation
    const sessionId = require('crypto').randomBytes(16).toString('hex');
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (options.expiresIn || 3600) * 1000);
    
    return {
      id: sessionId,
      holderDID: options.holderDID,
      credentialIds: options.credentialIds || [],
      attributes: options.attributes || {},
      createdAt: now,
      expiresAt: expiresAt,
      expiresIn: options.expiresIn || 3600,
      metadata: options.metadata
    };
  }

  async validateSession(sessionId: string): Promise<boolean> {
    // Mock session validation - in real implementation this would check storage
    return sessionId?.length > 0;
  }

  async getSession(sessionId: string): Promise<any | null> {
    if (!sessionId || sessionId.length === 0) {
      return null;
    }
    
    // Mock session retrieval
    return {
      id: sessionId,
      holderDID: 'did:mock:holder',
      credentialIds: ['mock-credential'],
      attributes: { mock: true },
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 3600000),
      lastAccessedAt: new Date()
    };
  }

  async setSessionExpiry(sessionId: string, additionalTime: number): Promise<boolean> {
    // Mock session extension
    return sessionId?.length > 0;
  }

  async invalidateSession(sessionId: string): Promise<boolean> {
    // Mock session invalidation
    return sessionId?.length > 0;
  }

  async batchVerifyPresentations(presentations: VerifiablePresentation[], options?: any): Promise<any> {
    // Mock batch verification
    const results = presentations.map((presentation, index) => ({
      presentationIndex: index,
      result: {
        isValid: true,
        holder: 'did:mock:holder',
        holderDID: 'did:mock:holder',
        credentials: [],
        credentialIds: ['mock-credential'],
        attributes: {},
        disclosedAttributes: {}
      },
      processingTime: 50 + Math.random() * 100
    }));

    return {
      total: presentations.length,
      successful: presentations.length,
      failed: 0,
      processingTimeMs: results.reduce((sum, r) => sum + r.processingTime, 0),
      results
    };
  }

  async batchCheckRevocations(credentialIds: string[]): Promise<Map<string, boolean>> {
    // Mock batch revocation check
    const results = new Map<string, boolean>();
    credentialIds.forEach(id => {
      // Randomly mark 10% as revoked for testing
      results.set(id, Math.random() < 0.1);
    });
    return results;
  }

  async getBatchStatistics(): Promise<any> {
    // Mock batch statistics
    return {
      totalVerifications: 100,
      averageProcessingTime: 75,
      successRate: 98.5,
      lastUpdated: new Date().toISOString()
    };
  }

  // Delegate other methods to the base provider
  async verifyPresentation(presentation: VerifiablePresentation, options?: any): Promise<any> {
    const result = await this.baseProvider.verifyPresentation(presentation, options);
    
    // Normalize the result to our expected format
    return {
      isValid: result.valid || false,
      holder: result.holder,
      holderDID: result.holder, // Alias
      credentials: result.credentials || [],
      credentialIds: (result.credentials || []).map((c: any) => c.id),
      attributes: result.credentials?.[0]?.credentialSubject || {},
      disclosedAttributes: result.credentials?.[0]?.credentialSubject || {},
      errors: result.errors || []
    };
  }
}

export default ServiceProviderAdapter;