/**
 * Example client showing how to interact with the Anonymous Identity Service
 * 
 * This example demonstrates:
 * 1. Creating a user wallet and credentials
 * 2. Getting service requirements
 * 3. Creating selective disclosure presentations
 * 4. Verifying presentations and creating sessions
 * 5. Accessing protected resources
 * 6. Real-time credential status monitoring
 */

import { 
  UserWallet, 
  IdentityProvider,
  CryptoService, 
  DIDService,
  MemoryStorageProvider,
  type VerifiableCredential,
  type VerifiablePresentation
} from 'anon-identity';
import { io, Socket } from 'socket.io-client';

const API_BASE_URL = 'http://localhost:3000';
const WS_URL = 'http://localhost:3000';

class ExampleClient {
  private userWallet: UserWallet;
  private identityProvider: IdentityProvider;
  private socket: Socket | null = null;
  private userDID: string;
  private credential: VerifiableCredential | null = null;
  private sessionId: string | null = null;

  constructor() {
    this.initializeIdentityComponents();
  }

  private async initializeIdentityComponents() {
    try {
      console.log('🔧 Initializing identity components...');

      // Initialize crypto and DID services
      const cryptoService = new CryptoService();
      const didService = new DIDService();
      const storage = new MemoryStorageProvider();

      // Generate key pair for user
      const userKeyPair = await cryptoService.generateKeyPair();
      this.userDID = await didService.createDID(userKeyPair.publicKey);

      // Create user wallet
      this.userWallet = new UserWallet(userKeyPair, 'user-passphrase');

      // Create identity provider (for issuing credentials)
      const issuerKeyPair = await cryptoService.generateKeyPair();
      const issuerDID = await didService.createDID(issuerKeyPair.publicKey);
      this.identityProvider = new IdentityProvider(issuerKeyPair, issuerDID, storage);

      console.log('✅ Identity components initialized');
      console.log(`   User DID: ${this.userDID}`);
      console.log(`   Issuer DID: ${issuerDID}`);
    } catch (error) {
      console.error('❌ Failed to initialize identity components:', error);
      throw error;
    }
  }

  async createUserCredential(): Promise<void> {
    try {
      console.log('\n📋 Creating user credential...');

      // Define user attributes
      const userAttributes = {
        id: this.userDID,
        givenName: 'John Doe',
        age: 25,
        isOver18: true,
        isOver21: true,
        country: 'US',
        emailAddress: 'john.doe@example.com',
        phoneNumber: '+1-555-0123',
        subscriptionStatus: 'premium',
        subscriptionExpiry: Date.now() + (365 * 24 * 60 * 60 * 1000), // 1 year
        creditScore: 750,
        income: 85000
      };

      // Issue credential
      this.credential = await this.identityProvider.issueVerifiableCredential(
        'BasicProfileCredential',
        this.userDID,
        userAttributes
      );

      // Store in wallet
      await this.userWallet.storeCredential(this.credential);

      console.log('✅ Credential created and stored');
      console.log(`   Credential ID: ${this.credential.id}`);
      console.log(`   Attributes: ${Object.keys(userAttributes).join(', ')}`);
    } catch (error) {
      console.error('❌ Failed to create credential:', error);
      throw error;
    }
  }

  async getServiceRequirements(endpoint: string): Promise<any> {
    try {
      console.log(`\n🔍 Getting requirements for endpoint: ${endpoint}`);

      const response = await fetch(`${API_BASE_URL}/service/requirements?endpoint=${endpoint}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const requirements = await response.json();
      
      console.log('✅ Service requirements retrieved:');
      console.log(`   Service DID: ${requirements.serviceDID}`);
      console.log(`   Required credentials: ${requirements.requirements.credentialTypes.join(', ')}`);
      console.log(`   Required attributes: ${requirements.requirements.attributeConstraints
        .filter((c: any) => c.required)
        .map((c: any) => c.name)
        .join(', ')}`);
      console.log(`   Challenge: ${requirements.challenge}`);

      return requirements;
    } catch (error) {
      console.error(`❌ Failed to get service requirements:`, error);
      throw error;
    }
  }

  async createSelectiveDisclosurePresentation(
    requirements: any,
    disclosedAttributes: string[]
  ): Promise<VerifiablePresentation> {
    try {
      console.log(`\n🎭 Creating selective disclosure presentation...`);
      console.log(`   Disclosing attributes: ${disclosedAttributes.join(', ')}`);

      if (!this.credential) {
        throw new Error('No credential available');
      }

      const presentation = await this.userWallet.createSelectiveDisclosurePresentation(
        this.credential.id,
        disclosedAttributes,
        requirements.serviceDID,
        { challenge: requirements.challenge }
      );

      console.log('✅ Selective disclosure presentation created');
      return presentation;
    } catch (error) {
      console.error('❌ Failed to create presentation:', error);
      throw error;
    }
  }

  async verifyPresentationAndCreateSession(
    presentation: VerifiablePresentation,
    endpoint: string
  ): Promise<string> {
    try {
      console.log(`\n🔐 Verifying presentation and creating session...`);

      const response = await fetch(`${API_BASE_URL}/auth/verify-presentation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          presentation,
          endpoint
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Verification failed: ${errorData.message}`);
      }

      const result = await response.json();
      this.sessionId = result.sessionId;

      console.log('✅ Presentation verified and session created:');
      console.log(`   Session ID: ${result.sessionId}`);
      console.log(`   Expires in: ${result.expiresIn} seconds`);
      console.log(`   Disclosure type: ${result.disclosureType}`);
      console.log(`   Verified attributes: ${result.verifiedAttributes.join(', ')}`);

      return result.sessionId;
    } catch (error) {
      console.error('❌ Verification failed:', error);
      throw error;
    }
  }

  async accessProtectedResource(endpoint: string): Promise<any> {
    try {
      console.log(`\n🔒 Accessing protected resource: ${endpoint}`);

      if (!this.sessionId) {
        throw new Error('No active session');
      }

      const response = await fetch(`${API_BASE_URL}${endpoint}`, {
        headers: {
          'Authorization': `Bearer ${this.sessionId}`
        }
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Access denied: ${errorData.message}`);
      }

      const data = await response.json();
      
      console.log('✅ Protected resource accessed successfully');
      console.log('   Response:', JSON.stringify(data, null, 2));

      return data;
    } catch (error) {
      console.error(`❌ Failed to access ${endpoint}:`, error);
      throw error;
    }
  }

  async setupWebSocketMonitoring(): Promise<void> {
    try {
      console.log('\n📡 Setting up WebSocket monitoring...');

      this.socket = io(WS_URL);

      this.socket.on('connect', () => {
        console.log('✅ WebSocket connected');

        if (this.credential) {
          // Subscribe to credential status updates
          this.socket!.emit('subscribe:credential', this.credential.id);
          console.log(`   Subscribed to credential: ${this.credential.id}`);
        }

        if (this.sessionId) {
          // Subscribe to session updates
          this.socket!.emit('subscribe:session', this.sessionId);
          console.log(`   Subscribed to session: ${this.sessionId}`);
        }
      });

      this.socket.on('credential:status', (data) => {
        console.log('📢 Credential status update:', data);
        if (data.isRevoked) {
          console.log('⚠️  Credential has been revoked!');
        }
      });

      this.socket.on('session:status', (data) => {
        console.log('📢 Session status update:', data);
        if (!data.isValid) {
          console.log('⚠️  Session has expired!');
          this.sessionId = null;
        }
      });

      this.socket.on('error', (error) => {
        console.error('📡 WebSocket error:', error);
      });

      this.socket.on('disconnect', (reason) => {
        console.log('📡 WebSocket disconnected:', reason);
      });

    } catch (error) {
      console.error('❌ Failed to setup WebSocket monitoring:', error);
      throw error;
    }
  }

  async demonstrateFullFlow(): Promise<void> {
    try {
      console.log('🚀 Starting full demonstration flow...\n');

      // Step 1: Create user credential
      await this.createUserCredential();

      // Step 2: Set up WebSocket monitoring
      await this.setupWebSocketMonitoring();

      // Step 3: Get service requirements for profile endpoint
      const profileRequirements = await this.getServiceRequirements('/profile');

      // Step 4: Create selective disclosure presentation
      const requiredAttributes = profileRequirements.requirements.attributeConstraints
        .filter((c: any) => c.required)
        .map((c: any) => c.name);
      
      const presentation = await this.createSelectiveDisclosurePresentation(
        profileRequirements,
        requiredAttributes
      );

      // Step 5: Verify presentation and create session
      await this.verifyPresentationAndCreateSession(presentation, '/profile');

      // Step 6: Access protected resources
      await this.accessProtectedResource('/profile');
      await this.accessProtectedResource('/profile/verify-age?requiredAge=21');

      // Step 7: Demonstrate premium access
      try {
        await this.accessProtectedResource('/profile/premium');
      } catch (error) {
        console.log('ℹ️  Expected: Premium access requires specific credentials');
      }

      // Step 8: Demonstrate financial access
      try {
        await this.accessProtectedResource('/profile/financial');
      } catch (error) {
        console.log('ℹ️  Note: Financial access may require additional attributes');
      }

      // Step 9: Get session activity
      await this.accessProtectedResource('/profile/activity');

      console.log('\n🎉 Demonstration completed successfully!');
      console.log('   The service is now running and monitoring credential status.');
      console.log('   Try accessing the API endpoints directly or through the WebSocket.');

    } catch (error) {
      console.error('💥 Demonstration failed:', error);
      throw error;
    }
  }

  async cleanup(): Promise<void> {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  const client = new ExampleClient();
  
  client.demonstrateFullFlow()
    .then(() => {
      console.log('\n✨ Example completed. Press Ctrl+C to exit.');
      
      // Keep the process alive to maintain WebSocket connection
      process.on('SIGINT', async () => {
        console.log('\n🛑 Shutting down example client...');
        await client.cleanup();
        process.exit(0);
      });
    })
    .catch((error) => {
      console.error('💥 Example failed:', error);
      process.exit(1);
    });
}

export default ExampleClient;