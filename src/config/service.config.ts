import { config } from './index';

export interface AttributeConstraint {
  name: string;
  required: boolean;
  expectedValue?: any;
  allowedValues?: any[];
  minValue?: number;
  maxValue?: number;
  pattern?: string;
}

export interface EndpointRequirement {
  credentialTypes: string[];
  attributeConstraints: AttributeConstraint[];
}

export const serviceConfig: {
  serviceDID: string;
  serviceName: string;
  serviceDomain: string;
  trustedIssuers: string[];
  sessionConfig: any;
  batchConfig: any;
  endpointRequirements: Record<string, EndpointRequirement>;
  attributeDescriptions: Record<string, string>;
  errorConfig: any;
} = {
  serviceDID: config.serviceDID,
  serviceName: config.serviceName,
  serviceDomain: config.serviceDomain,
  
  // Trusted credential issuers
  trustedIssuers: config.trustedIssuers,
  
  // Session management configuration
  sessionConfig: {
    defaultDuration: config.session.defaultDuration,
    maxDuration: config.session.maxDuration,
    cleanupInterval: config.session.cleanupInterval,
    enableMetadata: true
  },
  
  // Batch processing configuration
  batchConfig: {
    maxConcurrency: config.batch.maxConcurrency,
    timeoutMs: config.batch.timeoutMs,
    enableStatistics: true
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
          allowedValues: ['US', 'CA', 'UK', 'AU', 'DE', 'FR', 'ES', 'IT', 'NL', 'SE']
        },
        {
          name: 'givenName',
          required: false,
          pattern: '^[A-Za-z\\s]{1,50}$' // Letters and spaces, max 50 chars
        }
      ]
    } as EndpointRequirement,
    
    '/premium': {
      credentialTypes: ['BasicProfileCredential', 'SubscriptionCredential'],
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
    } as EndpointRequirement,
    
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
    } as EndpointRequirement,
    
    '/financial': {
      credentialTypes: ['BasicProfileCredential', 'FinancialCredential'],
      attributeConstraints: [
        {
          name: 'isOver21',
          required: true,
          expectedValue: true
        },
        {
          name: 'country',
          required: true,
          allowedValues: ['US', 'CA', 'UK']
        },
        {
          name: 'creditScore',
          required: true,
          minValue: 600,
          maxValue: 850
        },
        {
          name: 'income',
          required: false,
          minValue: 30000
        }
      ]
    } as EndpointRequirement
  },
  
  // Attribute descriptions for user understanding
  attributeDescriptions: {
    isOver18: 'Age verification for content access (18+)',
    isOver21: 'Age verification for financial services (21+)',
    age: 'Exact age for precise verification',
    country: 'Country of residence for regional compliance',
    givenName: 'First/given name for personalization (optional)',
    subscriptionStatus: 'Premium subscription level verification',
    subscriptionExpiry: 'Subscription expiration timestamp',
    creditScore: 'Credit score for financial services',
    income: 'Annual income for financial qualification (optional)',
    phoneNumber: 'Verified phone number (optional)',
    emailAddress: 'Verified email address (optional)'
  },
  
  // Error handling configuration
  errorConfig: {
    includeStackTrace: config.errorHandling.includeStackTrace,
    logErrors: config.errorHandling.logErrors,
    maxErrorHistory: config.errorHandling.maxErrorHistory
  }
};

export default serviceConfig;