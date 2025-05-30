import { createServer } from 'http';
import { config } from './config';
import logger from './utils/logger';
import createApp from './app';
import WebSocketServer from './websocket/server';
import ServiceProviderService from './services/service-provider.service';
import CacheService from './services/cache.service';

async function startServer() {
  try {
    logger.info('Starting Anonymous Identity Service...', {
      version: '1.0.0',
      environment: config.nodeEnv,
      port: config.port
    });

    // Initialize services
    logger.info('Initializing services...');
    const serviceProvider = new ServiceProviderService();
    const cacheService = new CacheService();

    // Connect to Redis
    try {
      await cacheService.connect();
      logger.info('Cache service connected successfully');
    } catch (error) {
      logger.warn('Cache service connection failed, continuing without cache', {
        error: error instanceof Error ? error.message : error
      });
    }

    // Create Express application
    const app = createApp();

    // Create HTTP server
    const httpServer = createServer(app);

    // Initialize WebSocket server if enabled
    let wsServer: WebSocketServer | null = null;
    if (config.websocket.enabled) {
      try {
        wsServer = new WebSocketServer(httpServer, serviceProvider, cacheService);
        logger.info('WebSocket server initialized');
      } catch (error) {
        logger.error('Failed to initialize WebSocket server', {
          error: error instanceof Error ? error.message : error
        });
        // Continue without WebSocket if it fails
      }
    }

    // Start server
    httpServer.listen(config.port, () => {
      logger.info('Server started successfully', {
        port: config.port,
        environment: config.nodeEnv,
        processId: process.pid,
        nodeVersion: process.version,
        websocketEnabled: config.websocket.enabled,
        apiBaseUrl: config.apiBaseUrl
      });

      // Log service configuration
      const serviceInfo = serviceProvider.getServiceInfo();
      logger.info('Service configuration', {
        serviceDID: serviceInfo.serviceDID,
        trustedIssuers: serviceInfo.trustedIssuers.length,
        endpoints: serviceInfo.endpoints.length,
        sessionConfig: serviceInfo.sessionConfig,
        batchConfig: serviceInfo.batchConfig
      });
    });

    // Graceful shutdown handling
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, starting graceful shutdown...`);

      // Close HTTP server (stops accepting new connections)
      httpServer.close(async (error) => {
        if (error) {
          logger.error('Error during HTTP server shutdown', { error: error.message });
        } else {
          logger.info('HTTP server closed successfully');
        }

        try {
          // Shutdown WebSocket server
          if (wsServer) {
            wsServer.shutdown();
            logger.info('WebSocket server shut down');
          }

          // Disconnect from cache
          await cacheService.disconnect();
          logger.info('Cache service disconnected');

          logger.info('Graceful shutdown completed');
          process.exit(0);
        } catch (shutdownError) {
          logger.error('Error during shutdown', {
            error: shutdownError instanceof Error ? shutdownError.message : shutdownError
          });
          process.exit(1);
        }
      });

      // Force shutdown after 30 seconds
      setTimeout(() => {
        logger.error('Forced shutdown after timeout');
        process.exit(1);
      }, 30000);
    };

    // Register shutdown handlers
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', {
        error: error.message,
        stack: error.stack
      });
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

    // Periodic health monitoring
    setInterval(async () => {
      try {
        const memoryUsage = process.memoryUsage();
        const cacheHealth = await cacheService.healthCheck();
        
        logger.debug('Health monitoring', {
          memoryUsage,
          cacheConnected: cacheHealth.connected,
          cacheLatency: cacheHealth.latency,
          websocketClients: wsServer?.getConnectedClients() || 0,
          uptime: process.uptime()
        });

        // Alert on high memory usage
        const memoryUsageMB = memoryUsage.heapUsed / 1024 / 1024;
        if (memoryUsageMB > 500) { // 500MB threshold
          logger.warn('High memory usage detected', {
            heapUsedMB: memoryUsageMB,
            heapTotalMB: memoryUsage.heapTotal / 1024 / 1024
          });
        }
      } catch (error) {
        logger.debug('Health monitoring error', {
          error: error instanceof Error ? error.message : error
        });
      }
    }, 60000); // Every minute

    // Log startup completion
    setTimeout(() => {
      logger.info('Server startup completed successfully', {
        port: config.port,
        uptime: process.uptime()
      });
    }, 1000);

  } catch (error) {
    logger.error('Failed to start server', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined
    });
    process.exit(1);
  }
}

// Start the server
startServer().catch((error) => {
  console.error('Fatal error during server startup:', error);
  process.exit(1);
});