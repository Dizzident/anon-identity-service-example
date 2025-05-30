import { Router } from 'express';
import ServiceProviderService from '../services/service-provider.service';
import CacheService from '../services/cache.service';
import VerificationController from '../controllers/verification.controller';
import SessionController from '../controllers/session.controller';
import ServiceController from '../controllers/service.controller';
import ProfileController from '../controllers/profile.controller';
import AuthMiddleware from '../middleware/auth.middleware';
import createAuthRoutes from './auth.routes';
import createServiceRoutes from './service.routes';
import createProfileRoutes from './profile.routes';
import logger from '../utils/logger';

export function createRoutes(): Router {
  const router = Router();

  try {
    // Initialize services
    const serviceProvider = new ServiceProviderService();
    const cacheService = new CacheService();

    // Initialize controllers
    const verificationController = new VerificationController(serviceProvider, cacheService);
    const sessionController = new SessionController(serviceProvider, cacheService);
    const serviceController = new ServiceController(serviceProvider, cacheService);
    const profileController = new ProfileController(cacheService);

    // Initialize middleware
    const authMiddleware = new AuthMiddleware(serviceProvider);

    // Root route
    router.get('/', (req, res) => {
      res.json({
        success: true,
        message: 'Anonymous Identity Service API',
        version: '1.0.0',
        documentation: '/service/api-docs',
        health: '/service/health',
        timestamp: new Date().toISOString()
      });
    });

    // Mount route modules
    router.use('/auth', createAuthRoutes(verificationController, sessionController, authMiddleware));
    router.use('/service', createServiceRoutes(serviceController, verificationController));
    router.use('/profile', createProfileRoutes(profileController, authMiddleware));

    // Legacy routes for backward compatibility
    router.get('/service/requirements', verificationController.getRequirements);
    router.post('/auth/verify-token', verificationController.verifyPresentation);

    // Credential status route (public endpoint)
    router.get('/credential/status/:id', async (req, res) => {
      try {
        const { id } = req.params;
        const revocationResults = await serviceProvider.batchCheckRevocations([id]);
        const isRevoked = revocationResults.get(id) || false;

        res.json({
          success: true,
          credentialId: id,
          isRevoked,
          status: isRevoked ? 'revoked' : 'valid',
          checkedAt: new Date().toISOString()
        });
      } catch (error) {
        logger.error('Credential status check failed', {
          credentialId: req.params.id,
          error: error instanceof Error ? error.message : error
        });

        res.status(500).json({
          success: false,
          error: 'CREDENTIAL_STATUS_CHECK_FAILED',
          message: 'Failed to check credential status'
        });
      }
    });

    // Analytics endpoint (public endpoint with rate limiting)
    router.get('/analytics/batch-stats', verificationController.getBatchStatistics);

    logger.info('Routes initialized successfully');

    return router;
  } catch (error) {
    logger.error('Failed to initialize routes', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }
}

export default createRoutes;