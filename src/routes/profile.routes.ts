import { Router } from 'express';
import ProfileController from '../controllers/profile.controller';
import AuthMiddleware from '../middleware/auth.middleware';
import rateLimitMiddleware from '../middleware/rate-limit.middleware';
import serviceConfig from '../config/service.config';

export function createProfileRoutes(
  profileController: ProfileController,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();

  // All profile routes require authentication
  router.use(authMiddleware.validateSession);
  router.use(authMiddleware.logSessionAccess);
  router.use(authMiddleware.extendSessionOnAccess(300)); // Extend by 5 minutes on access

  // Basic profile route - requires basic profile credentials
  router.get(
    '/',
    rateLimitMiddleware.standardRateLimit,
    authMiddleware.requireAttributes(['isOver18', 'country']),
    profileController.getProfile
  );

  // Premium profile route - requires premium subscription
  router.get(
    '/premium',
    rateLimitMiddleware.standardRateLimit,
    authMiddleware.requireAttributes(['isOver18', 'country', 'subscriptionStatus']),
    profileController.getPremiumProfile
  );

  // Age verification route
  router.get(
    '/verify-age',
    rateLimitMiddleware.standardRateLimit,
    // Age verification can use either exact age or age flags
    profileController.verifyAge
  );

  // Financial profile route - requires financial credentials
  router.get(
    '/financial',
    rateLimitMiddleware.standardRateLimit,
    authMiddleware.requireAttributes(['isOver21', 'creditScore']),
    profileController.getFinancialProfile
  );

  // User preferences routes
  router.get(
    '/preferences',
    rateLimitMiddleware.standardRateLimit,
    profileController.getPreferences
  );

  router.put(
    '/preferences',
    rateLimitMiddleware.standardRateLimit,
    profileController.updatePreferences
  );

  // Session and activity information
  router.get(
    '/activity',
    rateLimitMiddleware.standardRateLimit,
    profileController.getActivitySummary
  );

  return router;
}

export default createProfileRoutes;