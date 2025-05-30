import { Request, Response } from 'express';
import ServiceProviderService from '../services/service-provider.service';
import CacheService from '../services/cache.service';
import serviceConfig from '../config/service.config';
import { config } from '../config';
import logger from '../utils/logger';
import { ValidationError } from '../utils/errors';
import { asyncHandler } from '../middleware/error.middleware';

export class ServiceController {
  constructor(
    private serviceProvider: ServiceProviderService,
    private cacheService: CacheService
  ) {}

  // Get service information
  getServiceInfo = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const serviceInfo = this.serviceProvider.getServiceInfo();

    res.json({
      success: true,
      service: {
        ...serviceInfo,
        version: '1.0.0',
        apiVersion: 'v1',
        environment: config.nodeEnv,
        uptime: process.uptime(),
        timestamp: new Date().toISOString()
      }
    });
  });

  // Get trusted issuers
  getTrustedIssuers = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    res.json({
      success: true,
      trustedIssuers: serviceConfig.trustedIssuers.map(issuer => ({
        did: issuer,
        // In a real implementation, you might include additional issuer information
        name: `Issuer ${issuer.slice(-8)}`, // Last 8 characters as a simple name
        status: 'active'
      }))
    });
  });

  // Get supported credential types
  getSupportedCredentialTypes = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const credentialTypes = new Set<string>();
    
    // Collect all credential types from endpoint requirements
    Object.values(serviceConfig.endpointRequirements).forEach(requirement => {
      requirement.credentialTypes.forEach(type => credentialTypes.add(type));
    });

    res.json({
      success: true,
      supportedCredentialTypes: Array.from(credentialTypes).map(type => ({
        type,
        description: this.getCredentialTypeDescription(type),
        endpoints: this.getEndpointsForCredentialType(type)
      }))
    });
  });

  // Get endpoint requirements
  getEndpointRequirements = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { endpoint } = req.query;

    if (endpoint) {
      // Get requirements for specific endpoint
      if (typeof endpoint !== 'string') {
        throw new ValidationError('Endpoint must be a string');
      }

      const requirements = serviceConfig.endpointRequirements[endpoint];
      if (!requirements) {
        throw new ValidationError(`No requirements found for endpoint: ${endpoint}`, {
          endpoint,
          availableEndpoints: Object.keys(serviceConfig.endpointRequirements)
        });
      }

      res.json({
        success: true,
        endpoint,
        requirements: {
          credentialTypes: requirements.credentialTypes,
          attributeConstraints: requirements.attributeConstraints.map(constraint => ({
            ...constraint,
            description: serviceConfig.attributeDescriptions[constraint.name] || 'No description available'
          }))
        }
      });
    } else {
      // Get all endpoint requirements
      const allRequirements = Object.entries(serviceConfig.endpointRequirements).map(
        ([endpointPath, requirements]) => ({
          endpoint: endpointPath,
          credentialTypes: requirements.credentialTypes,
          requiredAttributes: requirements.attributeConstraints
            .filter(constraint => constraint.required)
            .map(constraint => constraint.name),
          optionalAttributes: requirements.attributeConstraints
            .filter(constraint => !constraint.required)
            .map(constraint => constraint.name),
          attributeConstraints: requirements.attributeConstraints.length
        })
      );

      res.json({
        success: true,
        endpoints: allRequirements
      });
    }
  });

  // Get attribute descriptions
  getAttributeDescriptions = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const { attribute } = req.query;

    if (attribute) {
      // Get description for specific attribute
      if (typeof attribute !== 'string') {
        throw new ValidationError('Attribute must be a string');
      }

      const description = serviceConfig.attributeDescriptions[attribute];
      if (!description) {
        throw new ValidationError(`No description found for attribute: ${attribute}`, {
          attribute,
          availableAttributes: Object.keys(serviceConfig.attributeDescriptions)
        });
      }

      res.json({
        success: true,
        attribute,
        description
      });
    } else {
      // Get all attribute descriptions
      res.json({
        success: true,
        attributeDescriptions: serviceConfig.attributeDescriptions
      });
    }
  });

  // Health check endpoint
  healthCheck = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const startTime = Date.now();

    try {
      // Check service provider health
      const serviceInfo = this.serviceProvider.getServiceInfo();
      
      // Check cache health
      const cacheHealth = await this.cacheService.healthCheck();
      
      // Check batch statistics (indicates if anon-identity is working)
      const batchStats = await this.serviceProvider.getBatchStatistics();

      const responseTime = Date.now() - startTime;

      res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString(),
        responseTime,
        checks: {
          serviceProvider: {
            status: 'healthy',
            serviceDID: serviceInfo.serviceDID,
            trustedIssuers: serviceInfo.trustedIssuers.length
          },
          cache: {
            status: cacheHealth.connected ? 'healthy' : 'degraded',
            connected: cacheHealth.connected,
            latency: cacheHealth.latency
          },
          anonIdentity: {
            status: 'healthy',
            batchCapabilities: !!batchStats
          }
        },
        uptime: process.uptime(),
        memoryUsage: process.memoryUsage(),
        nodeVersion: process.version
      });
    } catch (error) {
      logger.error('Health check failed', {
        error: error instanceof Error ? error.message : error
      });

      const responseTime = Date.now() - startTime;

      res.status(503).json({
        success: false,
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        responseTime,
        error: 'Health check failed'
      });
    }
  });

  // Get service statistics
  getStatistics = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    try {
      // Get batch statistics from ServiceProvider
      const batchStats = await this.serviceProvider.getBatchStatistics();

      // Get counters from cache
      const verificationCount = await this.cacheService.getCounter('verifications');
      const sessionCount = await this.cacheService.getCounter('sessions');
      const errorCount = await this.cacheService.getCounter('errors');

      res.json({
        success: true,
        statistics: {
          uptime: process.uptime(),
          totalVerifications: verificationCount,
          totalSessions: sessionCount,
          totalErrors: errorCount,
          batchStatistics: batchStats,
          memoryUsage: process.memoryUsage(),
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      logger.error('Failed to get statistics', {
        error: error instanceof Error ? error.message : error
      });

      res.json({
        success: true,
        statistics: {
          uptime: process.uptime(),
          error: 'Some statistics unavailable',
          timestamp: new Date().toISOString()
        }
      });
    }
  });

  // Get API documentation
  getApiDocumentation = asyncHandler(async (req: Request, res: Response): Promise<void> => {
    const documentation = {
      openapi: '3.0.0',
      info: {
        title: 'Anonymous Identity Service API',
        version: '1.0.0',
        description: 'Enterprise-grade verification of W3C Verifiable Credentials using anon-identity v1.0.5'
      },
      servers: [
        {
          url: config.apiBaseUrl,
          description: 'Current server'
        }
      ],
      paths: {
        '/service/info': {
          get: {
            summary: 'Get service information',
            responses: {
              '200': {
                description: 'Service information retrieved successfully'
              }
            }
          }
        },
        '/service/requirements': {
          get: {
            summary: 'Get endpoint requirements',
            parameters: [
              {
                name: 'endpoint',
                in: 'query',
                description: 'Specific endpoint to get requirements for',
                schema: { type: 'string' }
              }
            ]
          }
        },
        '/auth/verify-presentation': {
          post: {
            summary: 'Verify a Verifiable Presentation',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      presentation: { type: 'object' },
                      endpoint: { type: 'string' },
                      requestId: { type: 'string' }
                    }
                  }
                }
              }
            }
          }
        }
        // Add more endpoints as needed
      }
    };

    res.json(documentation);
  });

  // Helper methods
  private getCredentialTypeDescription(type: string): string {
    const descriptions: Record<string, string> = {
      'BasicProfileCredential': 'Basic user profile information including age verification and location',
      'SubscriptionCredential': 'Premium subscription status and preferences',
      'FinancialCredential': 'Financial information for qualified services',
      'IdentityCredential': 'Core identity verification credential'
    };
    return descriptions[type] || 'Custom credential type';
  }

  private getEndpointsForCredentialType(type: string): string[] {
    const endpoints: string[] = [];
    
    Object.entries(serviceConfig.endpointRequirements).forEach(([endpoint, requirements]) => {
      if (requirements.credentialTypes.includes(type)) {
        endpoints.push(endpoint);
      }
    });
    
    return endpoints;
  }
}

export default ServiceController;