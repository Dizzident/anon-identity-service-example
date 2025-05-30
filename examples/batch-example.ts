/**
 * Batch Processing Example
 * 
 * Demonstrates the high-performance batch verification capabilities
 * of the Anonymous Identity Service using anon-identity v1.0.5
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

const API_BASE_URL = 'http://localhost:3000';

class BatchExample {
  private identityProvider: IdentityProvider;
  private users: Array<{
    wallet: UserWallet;
    did: string;
    credential: VerifiableCredential;
  }> = [];

  constructor() {
    this.initializeComponents();
  }

  private async initializeComponents() {
    console.log('🔧 Initializing batch processing components...');

    const cryptoService = new CryptoService();
    const didService = new DIDService();
    const storage = new MemoryStorageProvider();

    // Create identity provider
    const issuerKeyPair = await cryptoService.generateKeyPair();
    const issuerDID = await didService.createDID(issuerKeyPair.publicKey);
    this.identityProvider = new IdentityProvider(issuerKeyPair, issuerDID, storage);

    console.log('✅ Components initialized');
    console.log(`   Issuer DID: ${issuerDID}`);
  }

  async createMultipleUsers(count: number): Promise<void> {
    console.log(`\n👥 Creating ${count} users with credentials...`);
    
    const cryptoService = new CryptoService();
    const didService = new DIDService();

    for (let i = 0; i < count; i++) {
      try {
        // Generate user identity
        const userKeyPair = await cryptoService.generateKeyPair();
        const userDID = await didService.createDID(userKeyPair.publicKey);
        const wallet = new UserWallet(userKeyPair, `user-${i}-passphrase`);

        // Create varied user attributes
        const userAttributes = {
          id: userDID,
          givenName: `User ${i}`,
          age: 18 + (i % 50), // Ages 18-67
          isOver18: true,
          isOver21: (18 + (i % 50)) >= 21,
          country: ['US', 'CA', 'UK', 'AU', 'DE'][i % 5],
          subscriptionStatus: i % 3 === 0 ? 'premium' : 'basic',
          creditScore: 600 + (i % 200), // Credit scores 600-799
          income: 30000 + (i * 1000) // Varied income
        };

        // Issue credential
        const credential = await this.identityProvider.issueVerifiableCredential(
          'BasicProfileCredential',
          userDID,
          userAttributes
        );

        // Store in wallet
        await wallet.storeCredential(credential);

        this.users.push({ wallet, did: userDID, credential });

        if ((i + 1) % 10 === 0) {
          console.log(`   Created ${i + 1}/${count} users...`);
        }
      } catch (error) {
        console.error(`❌ Failed to create user ${i}:`, error);
        throw error;
      }
    }

    console.log(`✅ Created ${count} users successfully`);
  }

  async createBatchPresentations(attributesToDisclose: string[]): Promise<VerifiablePresentation[]> {
    console.log(`\n🎭 Creating batch presentations...`);
    console.log(`   Disclosing attributes: ${attributesToDisclose.join(', ')}`);

    const presentations: VerifiablePresentation[] = [];
    const serviceDID = 'did:key:z6MkhaXgBZDvotDkL5257faiztiGiC2QtKLGpbnnEGta2doK'; // Service DID

    for (let i = 0; i < this.users.length; i++) {
      try {
        const user = this.users[i];
        const presentation = await user.wallet.createSelectiveDisclosurePresentation(
          user.credential.id,
          attributesToDisclose,
          serviceDID,
          { challenge: `batch-challenge-${Date.now()}-${i}` }
        );

        presentations.push(presentation);

        if ((i + 1) % 10 === 0) {
          console.log(`   Created ${i + 1}/${this.users.length} presentations...`);
        }
      } catch (error) {
        console.error(`❌ Failed to create presentation for user ${i}:`, error);
        throw error;
      }
    }

    console.log(`✅ Created ${presentations.length} presentations`);
    return presentations;
  }

  async performBatchVerification(presentations: VerifiablePresentation[]): Promise<any> {
    console.log(`\n🔍 Performing batch verification of ${presentations.length} presentations...`);

    const startTime = Date.now();

    try {
      const response = await fetch(`${API_BASE_URL}/auth/batch-verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          presentations,
          options: {
            maxConcurrency: 10,
            timeoutMs: 30000
          }
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Batch verification failed: ${errorData.message}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      console.log('✅ Batch verification completed:');
      console.log(`   Total presentations: ${result.statistics.total}`);
      console.log(`   Successful: ${result.statistics.successful}`);
      console.log(`   Failed: ${result.statistics.failed}`);
      console.log(`   Success rate: ${result.statistics.successRate.toFixed(2)}%`);
      console.log(`   Processing time: ${result.statistics.processingTimeMs}ms`);
      console.log(`   Average per presentation: ${result.statistics.averageTimePerPresentation.toFixed(2)}ms`);
      console.log(`   Client-side duration: ${duration}ms`);

      return result;
    } catch (error) {
      console.error('❌ Batch verification failed:', error);
      throw error;
    }
  }

  async performBatchRevocationCheck(): Promise<any> {
    console.log(`\n🔍 Performing batch revocation check...`);

    const credentialIds = this.users.map(user => user.credential.id);
    const startTime = Date.now();

    try {
      const response = await fetch(`${API_BASE_URL}/auth/batch-revocation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          credentialIds
        })
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Batch revocation check failed: ${errorData.message}`);
      }

      const result = await response.json();
      const duration = Date.now() - startTime;

      console.log('✅ Batch revocation check completed:');
      console.log(`   Total credentials: ${result.statistics.total}`);
      console.log(`   Revoked: ${result.statistics.revoked}`);
      console.log(`   Valid: ${result.statistics.valid}`);
      console.log(`   Revocation rate: ${result.statistics.revocationRate.toFixed(2)}%`);
      console.log(`   Client-side duration: ${duration}ms`);

      return result;
    } catch (error) {
      console.error('❌ Batch revocation check failed:', error);
      throw error;
    }
  }

  async getBatchStatistics(): Promise<any> {
    console.log(`\n📊 Getting batch processing statistics...`);

    try {
      const response = await fetch(`${API_BASE_URL}/service/batch-stats`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(`Failed to get statistics: ${errorData.message}`);
      }

      const result = await response.json();

      console.log('✅ Batch statistics retrieved:');
      console.log('   Statistics:', JSON.stringify(result.statistics, null, 2));

      return result;
    } catch (error) {
      console.error('❌ Failed to get batch statistics:', error);
      throw error;
    }
  }

  async demonstratePerformanceScaling(): Promise<void> {
    console.log('\n📈 Demonstrating performance scaling...');

    const batchSizes = [5, 10, 25, 50];
    const results: Array<{
      batchSize: number;
      duration: number;
      successRate: number;
      throughput: number;
    }> = [];

    for (const batchSize of batchSizes) {
      console.log(`\n🔄 Testing batch size: ${batchSize}`);

      // Create subset of presentations
      const presentations = await this.createBatchPresentations(['isOver18', 'country']);
      const subsetPresentations = presentations.slice(0, batchSize);

      // Measure performance
      const startTime = Date.now();
      const result = await this.performBatchVerification(subsetPresentations);
      const duration = Date.now() - startTime;

      const throughput = (batchSize / duration) * 1000; // presentations per second

      results.push({
        batchSize,
        duration,
        successRate: result.statistics.successRate,
        throughput
      });

      console.log(`   Throughput: ${throughput.toFixed(2)} presentations/second`);
    }

    console.log('\n📊 Performance scaling results:');
    console.table(results);
  }

  async runBatchDemo(): Promise<void> {
    try {
      console.log('🚀 Starting batch processing demonstration...\n');

      // Create multiple users
      await this.createMultipleUsers(50);

      // Create presentations for basic verification
      const basicPresentations = await this.createBatchPresentations(['isOver18', 'country']);

      // Perform batch verification
      await this.performBatchVerification(basicPresentations);

      // Perform batch revocation check
      await this.performBatchRevocationCheck();

      // Get batch statistics
      await this.getBatchStatistics();

      // Demonstrate performance scaling
      await this.demonstratePerformanceScaling();

      console.log('\n🎉 Batch processing demonstration completed successfully!');
      console.log('   This demonstrates the high-performance capabilities of anon-identity v1.0.5');
      console.log('   for enterprise-scale verification workflows.');

    } catch (error) {
      console.error('💥 Batch demonstration failed:', error);
      throw error;
    }
  }
}

// Run the example if this file is executed directly
if (require.main === module) {
  const batchExample = new BatchExample();
  
  batchExample.runBatchDemo()
    .then(() => {
      console.log('\n✨ Batch example completed successfully!');
      process.exit(0);
    })
    .catch((error) => {
      console.error('💥 Batch example failed:', error);
      process.exit(1);
    });
}

export default BatchExample;