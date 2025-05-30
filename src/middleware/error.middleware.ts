import type { Request, Response, NextFunction } from 'express';
import { ServiceError, isServiceError } from '../utils/errors';
import logger from '../utils/logger';
import { config } from '../config';

export interface ErrorResponse {
  error: string;
  message: string;
  statusCode: number;
  context?: Record<string, any>;
  stack?: string;
  timestamp: string;
  path: string;
  method: string;
}

// Global error handler middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Don't handle if response already sent
  if (res.headersSent) {
    return next(error);
  }

  const timestamp = new Date().toISOString();
  const path = req.originalUrl || req.url;
  const method = req.method;

  let errorResponse: ErrorResponse;

  if (isServiceError(error)) {
    // Handle our custom service errors
    errorResponse = {
      error: error.code,
      message: error.message,
      statusCode: error.statusCode,
      context: error.context,
      timestamp,
      path,
      method
    };

    // Include stack trace in development
    if (config.errorHandling.includeStackTrace) {
      errorResponse.stack = error.stack;
    }

    // Log based on error severity
    if (error.statusCode >= 500) {
      logger.error('Service error', {
        error: error.code,
        message: error.message,
        statusCode: error.statusCode,
        context: error.context,
        stack: error.stack,
        path,
        method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    } else {
      logger.warn('Client error', {
        error: error.code,
        message: error.message,
        statusCode: error.statusCode,
        context: error.context,
        path,
        method,
        userAgent: req.get('User-Agent'),
        ip: req.ip
      });
    }
  } else {
    // Handle unexpected errors
    const statusCode = 500;
    errorResponse = {
      error: 'INTERNAL_SERVER_ERROR',
      message: config.isDevelopment ? error.message : 'An unexpected error occurred',
      statusCode,
      timestamp,
      path,
      method
    };

    // Include stack trace in development
    if (config.errorHandling.includeStackTrace) {
      errorResponse.stack = error.stack;
    }

    logger.error('Unexpected error', {
      message: error.message,
      stack: error.stack,
      path,
      method,
      userAgent: req.get('User-Agent'),
      ip: req.ip
    });
  }

  res.status(errorResponse.statusCode).json(errorResponse);
};

// 404 handler for unmatched routes
export const notFoundHandler = (req: Request, res: Response): void => {
  const errorResponse: ErrorResponse = {
    error: 'NOT_FOUND',
    message: `Route ${req.method} ${req.originalUrl} not found`,
    statusCode: 404,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  logger.warn('Route not found', {
    path: req.originalUrl,
    method: req.method,
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  res.status(404).json(errorResponse);
};

// Async error wrapper for route handlers
export const asyncHandler = (
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// Request validation error handler
export const validationErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  // Handle express-validator errors
  if (error.array && typeof error.array === 'function') {
    const errors = error.array();
    const errorResponse: ErrorResponse = {
      error: 'VALIDATION_ERROR',
      message: 'Request validation failed',
      statusCode: 400,
      context: { validationErrors: errors },
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    };

    logger.warn('Validation error', {
      errors,
      path: req.originalUrl,
      method: req.method,
      body: req.body
    });

    res.status(400).json(errorResponse);
    return;
  }

  // Pass to next error handler
  next(error);
};

// Rate limit error handler
export const rateLimitErrorHandler = (
  req: Request,
  res: Response
): void => {
  const errorResponse: ErrorResponse = {
    error: 'RATE_LIMIT_EXCEEDED',
    message: 'Too many requests, please try again later',
    statusCode: 429,
    timestamp: new Date().toISOString(),
    path: req.originalUrl,
    method: req.method
  };

  logger.warn('Rate limit exceeded', {
    path: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });

  res.status(429).json(errorResponse);
};

// CORS error handler
export const corsErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error && error.message && error.message.includes('CORS')) {
    const errorResponse: ErrorResponse = {
      error: 'CORS_ERROR',
      message: 'Cross-Origin Resource Sharing (CORS) error',
      statusCode: 403,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    };

    logger.warn('CORS error', {
      origin: req.get('Origin'),
      path: req.originalUrl,
      method: req.method
    });

    res.status(403).json(errorResponse);
    return;
  }

  next(error);
};

// Timeout error handler
export const timeoutErrorHandler = (
  error: any,
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (error.code === 'TIMEOUT' || error.timeout) {
    const errorResponse: ErrorResponse = {
      error: 'REQUEST_TIMEOUT',
      message: 'Request timeout',
      statusCode: 408,
      timestamp: new Date().toISOString(),
      path: req.originalUrl,
      method: req.method
    };

    logger.warn('Request timeout', {
      path: req.originalUrl,
      method: req.method,
      timeout: error.timeout
    });

    res.status(408).json(errorResponse);
    return;
  }

  next(error);
};

// Graceful shutdown error handler
export const shutdownErrorHandler = (): void => {
  process.on('uncaughtException', (error) => {
    logger.error('Uncaught Exception', { error: error.message, stack: error.stack });
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    logger.error('Unhandled Rejection', { 
      reason: reason instanceof Error ? reason.message : reason,
      stack: reason instanceof Error ? reason.stack : undefined,
      promise: promise.toString()
    });
    process.exit(1);
  });

  process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
  });

  process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
  });
};

export default {
  errorHandler,
  notFoundHandler,
  asyncHandler,
  validationErrorHandler,
  rateLimitErrorHandler,
  corsErrorHandler,
  timeoutErrorHandler,
  shutdownErrorHandler
};