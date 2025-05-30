// Custom error classes for the service

export class ServiceError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly context: Record<string, any>;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    context: Record<string, any> = {}
  ) {
    super(message);
    this.name = this.constructor.name;
    this.statusCode = statusCode;
    this.code = code;
    this.context = context;
    
    // Maintains proper stack trace for where our error was thrown
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      code: this.code,
      statusCode: this.statusCode,
      context: this.context,
      stack: this.stack
    };
  }
}

export class ValidationError extends ServiceError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, 400, 'VALIDATION_ERROR', context);
  }
}

export class AuthenticationError extends ServiceError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, 401, 'AUTHENTICATION_ERROR', context);
  }
}

export class AuthorizationError extends ServiceError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, 403, 'AUTHORIZATION_ERROR', context);
  }
}

export class NotFoundError extends ServiceError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, 404, 'NOT_FOUND', context);
  }
}

export class ConflictError extends ServiceError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, 409, 'CONFLICT_ERROR', context);
  }
}

export class RateLimitError extends ServiceError {
  constructor(message: string, context: Record<string, any> = {}) {
    super(message, 429, 'RATE_LIMIT_EXCEEDED', context);
  }
}

// Identity-specific errors
export class InvalidPresentationError extends ValidationError {
  public declare readonly code: string;
  
  constructor(errors: any[], context: Record<string, any> = {}) {
    const message = `Invalid presentation: ${errors.map(e => e.message).join(', ')}`;
    super(message, { ...context, verificationErrors: errors });
    (this as any).code = 'INVALID_PRESENTATION';
  }
}

export class MissingAttributesError extends ValidationError {
  public declare readonly code: string;
  
  constructor(requiredAttributes: string[], context: Record<string, any> = {}) {
    const message = `Missing required attributes: ${requiredAttributes.join(', ')}`;
    super(message, { ...context, requiredAttributes });
    (this as any).code = 'MISSING_REQUIRED_ATTRIBUTES';
  }
}

export class RevokedCredentialError extends AuthenticationError {
  public declare readonly code: string;
  
  constructor(credentialId: string, context: Record<string, any> = {}) {
    super(`Credential has been revoked: ${credentialId}`, { ...context, credentialId });
    (this as any).code = 'REVOKED_CREDENTIAL';
  }
}

export class ExpiredCredentialError extends AuthenticationError {
  public declare readonly code: string;
  
  constructor(credentialId: string, context: Record<string, any> = {}) {
    super(`Credential has expired: ${credentialId}`, { ...context, credentialId });
    (this as any).code = 'EXPIRED_CREDENTIAL';
  }
}

export class UntrustedIssuerError extends AuthenticationError {
  public declare readonly code: string;
  
  constructor(issuerDID: string, context: Record<string, any> = {}) {
    super(`Untrusted issuer: ${issuerDID}`, { ...context, issuerDID });
    (this as any).code = 'UNTRUSTED_ISSUER';
  }
}

export class InvalidSignatureError extends AuthenticationError {
  public declare readonly code: string;
  
  constructor(context: Record<string, any> = {}) {
    super('Invalid cryptographic signature', context);
    (this as any).code = 'INVALID_SIGNATURE';
  }
}

export class SessionNotFoundError extends NotFoundError {
  public declare readonly code: string;
  
  constructor(sessionId: string, context: Record<string, any> = {}) {
    super(`Session not found: ${sessionId}`, { ...context, sessionId });
    (this as any).code = 'SESSION_NOT_FOUND';
  }
}

export class SessionExpiredError extends AuthenticationError {
  public declare readonly code: string;
  
  constructor(sessionId: string, context: Record<string, any> = {}) {
    super(`Session has expired: ${sessionId}`, { ...context, sessionId });
    (this as any).code = 'SESSION_EXPIRED';
  }
}

export class BatchProcessingError extends ServiceError {
  constructor(message: string, failedItems: any[], context: Record<string, any> = {}) {
    super(message, 500, 'BATCH_PROCESSING_ERROR', { ...context, failedItems });
  }
}

// Error factory functions
export const createVerificationError = (code: string, message: string, context: any = {}) => {
  switch (code) {
    case 'EXPIRED_CREDENTIAL':
      return new ExpiredCredentialError(context.credentialId, context);
    case 'REVOKED_CREDENTIAL':
      return new RevokedCredentialError(context.credentialId, context);
    case 'UNTRUSTED_ISSUER':
      return new UntrustedIssuerError(context.issuerDID, context);
    case 'INVALID_SIGNATURE':
      return new InvalidSignatureError(context);
    case 'MISSING_REQUIRED_ATTRIBUTE':
      return new MissingAttributesError(context.requiredAttributes || [], context);
    default:
      return new ValidationError(message, { ...context, originalCode: code });
  }
};

export const isServiceError = (error: any): error is ServiceError => {
  return error instanceof ServiceError;
};