import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import { config } from './config';
import logger, { morganStream } from './utils/logger';
import createRoutes from './routes';
import errorMiddleware from './middleware/error.middleware';

export function createApp(): Application {
  const app: Application = express();

  // Trust proxy for accurate IP addresses in logs
  app.set('trust proxy', 1);

  // Security middleware
  if (config.security.helmetEnabled) {
    app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "ws:", "wss:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
        },
      },
      crossOriginEmbedderPolicy: false
    }));
  }

  // CORS configuration
  app.use(cors({
    origin: config.cors.origin === '*' ? true : config.cors.origin,
    credentials: config.cors.credentials,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Origin',
      'X-Requested-With',
      'Content-Type',
      'Accept',
      'Authorization',
      'Cache-Control',
      'Pragma'
    ],
    exposedHeaders: [
      'X-RateLimit-Limit',
      'X-RateLimit-Remaining',
      'X-RateLimit-Reset'
    ]
  }));

  // Compression middleware
  if (config.security.compressionEnabled) {
    app.use(compression({
      filter: (req, res) => {
        if (req.headers['x-no-compression']) {
          return false;
        }
        return compression.filter(req, res);
      },
      threshold: 1024 // Only compress responses larger than 1KB
    }));
  }

  // Body parsing middleware
  app.use(express.json({ 
    limit: '10mb',
    strict: true,
    type: ['application/json', 'application/vnd.api+json']
  }));
  app.use(express.urlencoded({ 
    extended: true, 
    limit: '10mb',
    parameterLimit: 100
  }));

  // Request logging
  const morganFormat = config.isDevelopment ? 'dev' : 'combined';
  app.use(morgan(morganFormat, { 
    stream: morganStream,
    skip: (req) => {
      // Skip logging for health check requests in production
      return !config.isDevelopment && req.url === '/service/health';
    }
  }));

  // Request ID middleware for tracing
  app.use((req, res, next) => {
    const requestId = req.headers['x-request-id'] || 
                     require('crypto').randomBytes(16).toString('hex');
    req.headers['x-request-id'] = requestId;
    res.setHeader('X-Request-ID', requestId);
    next();
  });

  // Request timing middleware
  app.use((req, res, next) => {
    const startTime = Date.now();
    
    res.on('finish', () => {
      const duration = Date.now() - startTime;
      
      // Log slow requests
      if (duration > 5000) { // 5 seconds
        logger.warn('Slow request detected', {
          method: req.method,
          url: req.originalUrl,
          duration,
          statusCode: res.statusCode,
          requestId: req.headers['x-request-id']
        });
      }
      
      // Set response time header
      res.setHeader('X-Response-Time', `${duration}ms`);
    });
    
    next();
  });

  // Health check endpoint (before routes for fast response)
  app.get('/health', (req, res) => {
    res.status(200).json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: '1.0.0'
    });
  });

  // API routes
  try {
    const routes = createRoutes();
    app.use('/api/v1', routes);
    
    // Legacy routes (without version prefix)
    app.use('/', routes);
    
    logger.info('Routes mounted successfully');
  } catch (error) {
    logger.error('Failed to mount routes', {
      error: error instanceof Error ? error.message : error
    });
    throw error;
  }

  // Error handling middleware (must be last)
  app.use(errorMiddleware.corsErrorHandler);
  app.use(errorMiddleware.timeoutErrorHandler);
  app.use(errorMiddleware.validationErrorHandler);
  app.use(errorMiddleware.errorHandler);
  app.use(errorMiddleware.notFoundHandler);

  // Graceful shutdown handlers
  errorMiddleware.shutdownErrorHandler();

  logger.info('Express application created successfully', {
    environment: config.nodeEnv,
    cors: config.cors,
    security: config.security
  });

  return app;
}

export default createApp;