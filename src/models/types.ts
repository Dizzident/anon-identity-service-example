// Type definitions for anon-identity integration
// These supplement the types from the anon-identity package

export interface ExtendedVerificationResult {
  isValid: boolean;
  holder?: string;
  holderDID?: string; // Compatibility alias
  credentials?: any[];
  credentialIds?: string[]; // Compatibility alias
  attributes?: Record<string, any>;
  disclosedAttributes?: Record<string, any>;
  errors?: Array<{
    code: string;
    message: string;
    context?: any;
  }>;
  verificationMethod?: string;
}

export interface ExtendedSession {
  id: string;
  holderDID: string;
  credentialIds: string[];
  attributes: Record<string, any>;
  createdAt: Date;
  expiresAt: Date;
  lastAccessedAt?: Date;
  metadata?: Record<string, any>;
  expiresIn?: number;
}

export interface ExtendedBatchVerificationResult {
  total: number;
  successful: number;
  failed: number;
  processingTimeMs: number;
  results: Array<{
    presentationIndex: number;
    result: ExtendedVerificationResult;
    processingTime: number;
  }>;
}

export interface ServiceProviderConfig {
  sessionConfig?: {
    defaultDuration: number;
    maxDuration: number;
    cleanupInterval: number;
    enableMetadata: boolean;
  };
  batchConfig?: {
    maxConcurrency: number;
    timeoutMs: number;
    enableStatistics: boolean;
  };
  errorConfig?: {
    includeStackTrace: boolean;
    logErrors: boolean;
    maxErrorHistory: number;
  };
}

export interface PresentationRequestOptions {
  credentialTypes: string[];
  attributeConstraints: Array<{
    name: string;
    required: boolean;
    expectedValue?: any;
    allowedValues?: any[];
    minValue?: number;
    maxValue?: number;
    pattern?: string;
  }>;
  challenge: string;
  domain: string;
  purpose: string;
  requestId?: string;
}

export interface ExtendedPresentationRequest {
  requestId: string;
  credentialTypes: string[];
  attributeConstraints: any[];
  challenge: string;
  domain: string;
  purpose: string;
}

export interface SessionCreationOptions {
  holderDID: string;
  credentialIds: string[];
  attributes: Record<string, any>;
  expiresIn?: number;
  metadata?: Record<string, any>;
}