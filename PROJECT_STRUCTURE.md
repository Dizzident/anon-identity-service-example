# Project Structure and Implementation Guide

## Directory Structure

```
anon-identity-service-example/
├── src/
│   ├── config/
│   │   ├── index.ts              # Configuration loader
│   │   ├── service.config.ts     # Service requirements and trusted issuers
│   │   └── did.config.ts         # DID and credential type configuration
│   ├── controllers/
│   │   ├── verification.controller.ts  # Presentation verification endpoints
│   │   ├── profile.controller.ts      # Protected resource endpoints
│   │   └── service.controller.ts      # Service info and requirements
│   ├── middleware/
│   │   ├── auth.middleware.ts    # Presentation verification middleware
│   │   ├── error.middleware.ts   # Global error handler
│   │   └── rate-limit.middleware.ts # Rate limiting
│   ├── services/
│   │   ├── service-provider.service.ts # Enhanced ServiceProvider wrapper with v1.0.5 features
│   │   ├── session.service.ts         # Built-in session management from anon-identity
│   │   ├── batch.service.ts           # Batch verification and revocation checking
│   │   ├── presentation-request.service.ts # Structured presentation requests
│   │   ├── error-handler.service.ts   # Comprehensive error handling
│   │   ├── revocation.service.ts      # Revocation status checking
│   │   └── cache.service.ts           # Redis caching for DIDs/revocations
│   ├── models/
│   │   ├── presentation.model.ts      # Presentation interfaces
│   │   ├── presentation-request.model.ts # Structured request interfaces
│   │   ├── verification.model.ts      # Enhanced verification result interfaces
│   │   ├── session.model.ts           # Session data models from anon-identity
│   │   ├── batch.model.ts             # Batch operation interfaces
│   │   └── error.model.ts             # Comprehensive error type definitions
│   ├── routes/
│   │   ├── index.ts              # Route aggregator
│   │   ├── auth.routes.ts        # Authentication route definitions
│   │   └── api.routes.ts         # API route definitions
│   ├── utils/
│   │   ├── logger.ts             # Winston logger setup
│   │   ├── validators.ts         # Presentation validation helpers
│   │   └── errors.ts             # Custom error classes
│   ├── websocket/
│   │   ├── server.ts             # WebSocket server setup
│   │   └── handlers.ts           # Real-time credential status updates
│   ├── app.ts                    # Express app setup
│   └── server.ts                 # Server entry point
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/
├── docs/
│   ├── API.md                    # API documentation
│   ├── INTEGRATION.md            # Integration guide
│   └── examples/                 # Example implementations
├── docker/
│   ├── Dockerfile
│   └── docker-compose.yml
├── .env.example
├── package.json
├── tsconfig.json
├── jest.config.js
└── README.md
```

## Key Implementation Files

### 1. Enhanced Service Configuration (src/config/service.config.ts)

```typescript
import { ServiceProvider, SessionManagerConfig } from 'anon-identity';

export const serviceConfig = {
  serviceDID: 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK',
  serviceName: 'Anonymous Identity Example Service',
  
  // Trusted credential issuers
  trustedIssuers: [
    'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK', // Example issuer
    'did:key:z6MknGc3ocHs2rt5u8Kf3hX7vnbqvTJvJ4C3gXR2YsE8WqmX'  // Another issuer
  ],
  
  // Session management configuration
  sessionConfig: {
    defaultDuration: 3600,      // 1 hour default
    maxDuration: 86400,         // 24 hours maximum
    cleanupInterval: 300,       // Clean expired sessions every 5 minutes
    enableMetadata: true        // Allow custom session metadata
  } as SessionManagerConfig,
  
  // Batch processing configuration
  batchConfig: {
    maxConcurrency: 10,         // Maximum concurrent verifications
    timeoutMs: 15000,           // 15 second timeout per verification
    enableStatistics: true      // Track batch processing stats
  },
  
  // Structured presentation requests per endpoint
  endpointRequirements: {
    '/profile': {
      credentialTypes: ['BasicProfileCredential'],
      attributeConstraints: [
        {
          name: 'isOver18',
          required: true,
          expectedValue: true
        },
        {
          name: 'country',
          required: true,
          allowedValues: ['US', 'CA', 'UK', 'AU', 'DE', 'FR']
        },
        {
          name: 'givenName',
          required: false,
          pattern: '^[A-Za-z\\s]{1,50}$' // Letters and spaces, max 50 chars
        }
      ]
    },
    '/premium': {
      credentialTypes: ['BasicProfileCredential', 'SubscriptionCredential'],
      attributeConstraints: [
        {
          name: 'isOver18',
          required: true,
          expectedValue: true
        },
        {
          name: 'subscriptionStatus',
          required: true,
          allowedValues: ['premium', 'enterprise']
        },
        {
          name: 'subscriptionExpiry',
          required: true,
          minValue: Date.now() // Must not be expired
        }
      ]
    },
    '/verify-age': {
      credentialTypes: ['BasicProfileCredential'],
      attributeConstraints: [
        {
          name: 'age',
          required: true,
          minValue: 18,
          maxValue: 120
        }
      ]
    }
  },
  
  // Error handling configuration
  errorConfig: {
    includeStackTrace: process.env.NODE_ENV === 'development',
    logErrors: true,
    maxErrorHistory: 1000
  }
};
```

### 2. Enhanced Service Provider Wrapper (src/services/service-provider.service.ts)

```typescript
import { 
  ServiceProvider, 
  MemoryStorageProvider,
  SessionManager,
  BatchOperations,
  PresentationRequest,
  VerificationError
} from 'anon-identity';
import { serviceConfig } from '../config/service.config';

export class ServiceProviderService {
  private serviceProvider: ServiceProvider;
  private sessionManager: SessionManager;
  private batchOperations: BatchOperations;
  private presentationRequest: PresentationRequest;
  
  constructor() {
    const storage = new MemoryStorageProvider();
    
    // Initialize enhanced ServiceProvider with v1.0.5 features
    this.serviceProvider = new ServiceProvider(
      serviceConfig.serviceDID,
      storage,
      serviceConfig.trustedIssuers,
      {
        sessionConfig: serviceConfig.sessionConfig,
        batchConfig: serviceConfig.batchConfig,
        errorConfig: serviceConfig.errorConfig
      }
    );
    
    // Initialize additional components
    this.sessionManager = this.serviceProvider.sessionManager;
    this.batchOperations = this.serviceProvider.batchOperations;
    this.presentationRequest = this.serviceProvider.presentationRequest;
  }

  // Create structured presentation request
  async createPresentationRequest(endpoint: string, domain?: string) {
    const requirements = serviceConfig.endpointRequirements[endpoint];
    if (!requirements) {
      throw new Error(`No requirements defined for endpoint: ${endpoint}`);
    }
    
    return await this.presentationRequest.createRequest({
      credentialTypes: requirements.credentialTypes,
      attributeConstraints: requirements.attributeConstraints,
      challenge: crypto.randomBytes(32).toString('hex'),
      domain: domain || 'localhost:3000',
      purpose: `Access to ${endpoint} endpoint`
    });
  }

  // Verify presentation against structured request
  async verifyPresentationWithRequest(presentation: any, request: any) {
    const result = await this.serviceProvider.validatePresentationAgainstRequest(
      presentation,
      request
    );
    
    if (!result.isValid) {
      // Enhanced error handling with detailed context
      throw new VerificationError(
        result.errors[0]?.code || 'VERIFICATION_FAILED',
        result.errors[0]?.context || {},
        result.errors[0]?.message || 'Presentation verification failed'
      );
    }
    
    return result;
  }

  // Create session from verified presentation
  async createSessionFromVerification(verificationResult: any, metadata?: any) {
    return await this.sessionManager.createSession({
      holderDID: verificationResult.holderDID,
      credentialIds: verificationResult.credentialIds,
      attributes: verificationResult.disclosedAttributes || verificationResult.attributes,
      expiresIn: serviceConfig.sessionConfig.defaultDuration,
      metadata: {
        verifiedAt: Date.now(),
        verificationMethod: 'presentation',
        ...metadata
      }
    });
  }

  // Batch verify multiple presentations
  async batchVerifyPresentations(presentations: any[]) {
    return await this.batchOperations.batchVerifyPresentations(
      presentations,
      serviceConfig.batchConfig
    );
  }

  // Batch check revocation status
  async batchCheckRevocations(credentialIds: string[]) {
    return await this.batchOperations.batchCheckRevocations(credentialIds);
  }

  // Get batch processing statistics
  async getBatchStatistics() {
    return await this.batchOperations.getStatistics();
  }

  // Session management methods
  async validateSession(sessionId: string) {
    return await this.sessionManager.validateSession(sessionId);
  }

  async extendSession(sessionId: string, additionalTime: number) {
    return await this.sessionManager.setSessionExpiry(sessionId, additionalTime);
  }

  async invalidateSession(sessionId: string) {
    return await this.sessionManager.invalidateSession(sessionId);
  }

  // Legacy method for backward compatibility
  async verifyPresentation(presentation: any, endpoint: string) {
    const request = await this.createPresentationRequest(endpoint);
    const result = await this.verifyPresentationWithRequest(presentation, request);
    
    return {
      type: result.disclosedAttributes ? 'selective_disclosure' : 'full_disclosure',
      attributes: result.disclosedAttributes || result.attributes,
      credentialId: result.credentialIds[0],
      holderDID: result.holderDID
    };
  }
}
```

### 3. Verification Controller (src/controllers/verification.controller.ts)

```typescript
import { ServiceProviderService } from '../services/service-provider.service';
import { SessionService } from '../services/session.service';

export class VerificationController {
  constructor(
    private serviceProvider: ServiceProviderService,
    private sessionService: SessionService
  ) {}

  async getRequirements(req: Request, res: Response) {
    const { endpoint } = req.query;
    
    const requirements = serviceConfig.endpointRequirements[endpoint] || {
      credentialTypes: [],
      requiredAttributes: [],
      optionalAttributes: []
    };
    
    res.json({
      serviceDID: serviceConfig.serviceDID,
      serviceName: serviceConfig.serviceName,
      endpoint,
      requirements,
      attributeDescriptions: serviceConfig.attributeDescriptions,
      presentationEndpoint: '/auth/verify-presentation',
      challenge: crypto.randomBytes(32).toString('hex') // For replay protection
    });
  }

  async verifyPresentation(req: Request, res: Response) {
    const { presentation, endpoint } = req.body;
    
    try {
      // Verify the presentation
      const verificationResult = await this.serviceProvider.verifyPresentation(
        presentation,
        endpoint
      );
      
      // Create a session for the verified identity
      const session = await this.sessionService.createSession({
        credentialId: verificationResult.credentialId,
        endpoint,
        attributes: verificationResult.attributes,
        disclosureType: verificationResult.type
      });
      
      res.json({
        success: true,
        sessionId: session.id,
        expiresIn: session.expiresIn,
        disclosureType: verificationResult.type
      });
    } catch (error) {
      if (error instanceof InvalidPresentationError) {
        res.status(400).json({ error: 'Invalid presentation', details: error.errors });
      } else if (error instanceof MissingAttributesError) {
        res.status(400).json({ error: 'Missing required attributes', required: error.required });
      } else {
        res.status(500).json({ error: 'Verification failed' });
      }
    }
  }
}
```

### 4. WebSocket Implementation (src/websocket/server.ts)

```typescript
import { Server } from 'socket.io';
import { RevocationService } from '../services/revocation.service';

export function setupWebSocket(server: http.Server) {
  const io = new Server(server, {
    cors: { origin: '*' }
  });
  
  const revocationService = new RevocationService();

  io.on('connection', (socket) => {
    // Subscribe to credential status updates
    socket.on('subscribe:credential', async (credentialId: string) => {
      socket.join(`credential:${credentialId}`);
      
      // Send current revocation status
      const isRevoked = await revocationService.checkRevocation(credentialId);
      socket.emit('credential:status', { 
        credentialId, 
        isRevoked,
        timestamp: Date.now() 
      });
    });

    // Subscribe to all revocations from a specific issuer
    socket.on('subscribe:issuer', async (issuerDID: string) => {
      socket.join(`issuer:${issuerDID}`);
    });
    
    // Unsubscribe handlers
    socket.on('unsubscribe:credential', (credentialId: string) => {
      socket.leave(`credential:${credentialId}`);
    });
  });
  
  // Periodic revocation list updates
  setInterval(async () => {
    const updates = await revocationService.getRecentRevocations();
    updates.forEach(update => {
      io.to(`credential:${update.credentialId}`).emit('credential:status', {
        credentialId: update.credentialId,
        isRevoked: true,
        revokedAt: update.revokedAt
      });
      
      io.to(`issuer:${update.issuerDID}`).emit('revocation:update', update);
    });
  }, 30000); // Check every 30 seconds
}
```

## Implementation Steps

### Step 1: Initialize Project

```bash
npm init -y
npm install anon-identity@1.0.5
npm install express cors helmet morgan compression dotenv
npm install redis ioredis socket.io express-rate-limit
npm install --save-dev typescript @types/node @types/express
npm install --save-dev jest @types/jest ts-jest supertest
npm install --save-dev eslint prettier nodemon ts-node
npm install --save-dev @types/uuid # For session ID generation
```

### Step 2: Initialize Service Provider

```typescript
// src/services/init.ts
import { ServiceProvider, CryptoService, DIDService } from 'anon-identity';
import { MemoryStorageProvider } from 'anon-identity';

export async function initializeServiceProvider() {
  // Generate service provider's DID
  const cryptoService = new CryptoService();
  const keyPair = await cryptoService.generateKeyPair();
  const didService = new DIDService();
  const serviceDID = await didService.createDID(keyPair.publicKey);
  
  // Initialize storage (can use Redis, File, or Blockchain storage)
  const storage = new MemoryStorageProvider();
  
  // Create service provider instance
  const serviceProvider = new ServiceProvider(
    serviceDID,
    storage,
    serviceConfig.trustedIssuers
  );
  
  return { serviceProvider, serviceDID, keyPair };
}
```

### Step 3: Docker Setup

```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
RUN npm run build
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

## Example Client Implementation

```typescript
import { UserWallet, CryptoService } from 'anon-identity';

// Initialize user wallet
const cryptoService = new CryptoService();
const keyPair = await cryptoService.generateKeyPair();
const userWallet = new UserWallet(keyPair, 'user-passphrase');

// 1. Get service requirements for an endpoint
const requirements = await fetch('http://service.example/service/requirements?endpoint=/profile')
  .then(r => r.json());

console.log('Service requires:', requirements);
// {
//   serviceDID: 'did:key:...',
//   requirements: {
//     credentialTypes: ['BasicProfileCredential'],
//     requiredAttributes: ['isOver18', 'country'],
//     optionalAttributes: ['givenName']
//   },
//   challenge: 'abc123...'
// }

// 2. Find matching credential in wallet
const credentials = await userWallet.getCredentialsByType('BasicProfileCredential');
const credential = credentials[0];

// 3. Create selective disclosure presentation
const presentation = await userWallet.createSelectiveDisclosurePresentation(
  credential.id,
  ['isOver18', 'country'], // Only disclose required attributes
  requirements.serviceDID,
  { challenge: requirements.challenge } // Include challenge for replay protection
);

// 4. Submit presentation to service
const verificationResult = await fetch('http://service.example/auth/verify-presentation', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ 
    presentation, 
    endpoint: '/profile' 
  })
}).then(r => r.json());

console.log('Verification result:', verificationResult);
// {
//   success: true,
//   sessionId: 'sess_123...',
//   expiresIn: 3600
// }

// 5. Access protected resources with session
const profile = await fetch('http://service.example/profile', {
  headers: { 'Authorization': `Bearer ${verificationResult.sessionId}` }
}).then(r => r.json());

// 6. Subscribe to credential status updates
const socket = io('http://service.example');
socket.emit('subscribe:credential', credential.id);
socket.on('credential:status', (data) => {
  if (data.isRevoked) {
    console.log('Credential has been revoked');
    // Handle revocation - wallet should stop using this credential
  }
});
```

## Testing Strategy

1. **Unit Tests**: Test each service and controller in isolation
2. **Integration Tests**: Test API endpoints with mock anon-identity
3. **E2E Tests**: Full flow testing with real tokens
4. **Security Tests**: Token validation, rate limiting, injection attacks
5. **Performance Tests**: Load testing with multiple concurrent requests