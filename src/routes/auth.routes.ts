import { Router } from 'express';
import VerificationController from '../controllers/verification.controller';
import SessionController from '../controllers/session.controller';
import AuthMiddleware from '../middleware/auth.middleware';
import rateLimitMiddleware from '../middleware/rate-limit.middleware';

export function createAuthRoutes(
  verificationController: VerificationController,
  sessionController: SessionController,
  authMiddleware: AuthMiddleware
): Router {
  const router = Router();

  // Presentation and verification routes
  router.post(
    '/request-presentation',
    rateLimitMiddleware.presentationRequestRateLimit,
    verificationController.createPresentationRequest
  );

  router.post(
    '/verify-presentation',
    rateLimitMiddleware.credentialBasedRateLimit,
    verificationController.verifyPresentation
  );

  router.post(
    '/batch-verify',
    rateLimitMiddleware.batchRateLimit,
    verificationController.batchVerifyPresentations
  );

  router.post(
    '/batch-revocation',
    rateLimitMiddleware.batchRateLimit,
    verificationController.batchCheckRevocations
  );

  router.get(
    '/presentation/:id',
    rateLimitMiddleware.standardRateLimit,
    verificationController.getPresentationStatus
  );

  // Session management routes
  router.post(
    '/session/create',
    rateLimitMiddleware.sessionRateLimit,
    sessionController.createSession
  );

  router.get(
    '/session/:id/validate',
    rateLimitMiddleware.sessionRateLimit,
    sessionController.validateSession
  );

  router.post(
    '/session/:id/extend',
    rateLimitMiddleware.sessionRateLimit,
    authMiddleware.validateSession,
    sessionController.extendSession
  );

  router.delete(
    '/session/:id',
    rateLimitMiddleware.sessionRateLimit,
    authMiddleware.validateSession,
    sessionController.invalidateSession
  );

  router.get(
    '/session/:id',
    rateLimitMiddleware.standardRateLimit,
    authMiddleware.validateSession,
    sessionController.getSession
  );

  router.get(
    '/sessions',
    rateLimitMiddleware.standardRateLimit,
    authMiddleware.validateSession,
    sessionController.listSessions
  );

  router.get(
    '/session/:id/activity',
    rateLimitMiddleware.standardRateLimit,
    authMiddleware.validateSession,
    sessionController.getSessionActivity
  );

  return router;
}

export default createAuthRoutes;