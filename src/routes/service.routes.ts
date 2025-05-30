import { Router } from 'express';
import ServiceController from '../controllers/service.controller';
import VerificationController from '../controllers/verification.controller';
import rateLimitMiddleware from '../middleware/rate-limit.middleware';

export function createServiceRoutes(
  serviceController: ServiceController,
  verificationController: VerificationController
): Router {
  const router = Router();

  // Service information routes
  router.get(
    '/info',
    rateLimitMiddleware.standardRateLimit,
    serviceController.getServiceInfo
  );

  router.get(
    '/health',
    // No rate limiting for health checks
    serviceController.healthCheck
  );

  router.get(
    '/statistics',
    rateLimitMiddleware.standardRateLimit,
    serviceController.getStatistics
  );

  router.get(
    '/requirements',
    rateLimitMiddleware.standardRateLimit,
    serviceController.getEndpointRequirements
  );

  // Legacy route for backward compatibility
  router.get(
    '/requirements',
    rateLimitMiddleware.standardRateLimit,
    verificationController.getRequirements
  );

  router.get(
    '/trusted-issuers',
    rateLimitMiddleware.standardRateLimit,
    serviceController.getTrustedIssuers
  );

  router.get(
    '/credential-types',
    rateLimitMiddleware.standardRateLimit,
    serviceController.getSupportedCredentialTypes
  );

  router.get(
    '/attributes',
    rateLimitMiddleware.standardRateLimit,
    serviceController.getAttributeDescriptions
  );

  router.get(
    '/api-docs',
    rateLimitMiddleware.standardRateLimit,
    serviceController.getApiDocumentation
  );

  // Analytics and batch statistics
  router.get(
    '/batch-stats',
    rateLimitMiddleware.standardRateLimit,
    verificationController.getBatchStatistics
  );

  return router;
}

export default createServiceRoutes;