import { Server as SocketIOServer } from 'socket.io';
import { Server as HTTPServer } from 'http';
import ServiceProviderService from '../services/service-provider.service';
import CacheService from '../services/cache.service';
import { config } from '../config';
import logger from '../utils/logger';

export class WebSocketServer {
  private io: SocketIOServer;
  private serviceProvider: ServiceProviderService;
  private cacheService: CacheService;
  private revocationCheckInterval: NodeJS.Timeout | null = null;

  constructor(
    httpServer: HTTPServer,
    serviceProvider: ServiceProviderService,
    cacheService: CacheService
  ) {
    this.serviceProvider = serviceProvider;
    this.cacheService = cacheService;

    this.io = new SocketIOServer(httpServer, {
      cors: {
        origin: config.websocket.corsOrigin,
        methods: ['GET', 'POST'],
        credentials: false
      },
      pingTimeout: 60000,
      pingInterval: 25000
    });

    this.setupEventHandlers();
    this.startRevocationMonitoring();

    logger.info('WebSocket server initialized', {
      corsOrigin: config.websocket.corsOrigin
    });
  }

  private setupEventHandlers(): void {
    this.io.on('connection', (socket) => {
      logger.info('WebSocket client connected', {
        socketId: socket.id,
        remoteAddress: socket.handshake.address
      });

      // Subscribe to credential status updates
      socket.on('subscribe:credential', async (credentialId: string) => {
        try {
          if (!credentialId || typeof credentialId !== 'string') {
            socket.emit('error', {
              message: 'Invalid credential ID',
              code: 'INVALID_CREDENTIAL_ID'
            });
            return;
          }

          socket.join(`credential:${credentialId}`);
          
          // Send current revocation status
          const revocationResults = await this.serviceProvider.batchCheckRevocations([credentialId]);
          const isRevoked = revocationResults.get(credentialId) || false;
          
          socket.emit('credential:status', {
            credentialId,
            isRevoked,
            status: isRevoked ? 'revoked' : 'valid',
            timestamp: Date.now()
          });

          logger.debug('Client subscribed to credential', {
            socketId: socket.id,
            credentialId,
            isRevoked
          });
        } catch (error) {
          logger.error('Failed to subscribe to credential', {
            socketId: socket.id,
            credentialId,
            error: error instanceof Error ? error.message : error
          });

          socket.emit('error', {
            message: 'Failed to subscribe to credential',
            code: 'SUBSCRIPTION_FAILED',
            credentialId
          });
        }
      });

      // Subscribe to all revocations from a specific issuer
      socket.on('subscribe:issuer', async (issuerDID: string) => {
        try {
          if (!issuerDID || typeof issuerDID !== 'string') {
            socket.emit('error', {
              message: 'Invalid issuer DID',
              code: 'INVALID_ISSUER_DID'
            });
            return;
          }

          socket.join(`issuer:${issuerDID}`);

          logger.debug('Client subscribed to issuer', {
            socketId: socket.id,
            issuerDID
          });

          socket.emit('issuer:subscribed', {
            issuerDID,
            timestamp: Date.now()
          });
        } catch (error) {
          logger.error('Failed to subscribe to issuer', {
            socketId: socket.id,
            issuerDID,
            error: error instanceof Error ? error.message : error
          });

          socket.emit('error', {
            message: 'Failed to subscribe to issuer',
            code: 'ISSUER_SUBSCRIPTION_FAILED',
            issuerDID
          });
        }
      });

      // Subscribe to session updates
      socket.on('subscribe:session', async (sessionId: string) => {
        try {
          if (!sessionId || typeof sessionId !== 'string') {
            socket.emit('error', {
              message: 'Invalid session ID',
              code: 'INVALID_SESSION_ID'
            });
            return;
          }

          // Verify session exists and is valid
          const isValid = await this.serviceProvider.validateSession(sessionId);
          if (!isValid) {
            socket.emit('error', {
              message: 'Session not found or expired',
              code: 'SESSION_NOT_FOUND',
              sessionId
            });
            return;
          }

          socket.join(`session:${sessionId}`);

          const session = await this.serviceProvider.getSession(sessionId);
          socket.emit('session:status', {
            sessionId,
            isValid: true,
            expiresAt: session?.expiresAt,
            timestamp: Date.now()
          });

          logger.debug('Client subscribed to session', {
            socketId: socket.id,
            sessionId
          });
        } catch (error) {
          logger.error('Failed to subscribe to session', {
            socketId: socket.id,
            sessionId,
            error: error instanceof Error ? error.message : error
          });

          socket.emit('error', {
            message: 'Failed to subscribe to session',
            code: 'SESSION_SUBSCRIPTION_FAILED',
            sessionId
          });
        }
      });

      // Unsubscribe handlers
      socket.on('unsubscribe:credential', (credentialId: string) => {
        socket.leave(`credential:${credentialId}`);
        logger.debug('Client unsubscribed from credential', {
          socketId: socket.id,
          credentialId
        });
      });

      socket.on('unsubscribe:issuer', (issuerDID: string) => {
        socket.leave(`issuer:${issuerDID}`);
        logger.debug('Client unsubscribed from issuer', {
          socketId: socket.id,
          issuerDID
        });
      });

      socket.on('unsubscribe:session', (sessionId: string) => {
        socket.leave(`session:${sessionId}`);
        logger.debug('Client unsubscribed from session', {
          socketId: socket.id,
          sessionId
        });
      });

      // Handle ping/pong for connection health
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: Date.now() });
      });

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        logger.info('WebSocket client disconnected', {
          socketId: socket.id,
          reason
        });
      });

      // Handle errors
      socket.on('error', (error) => {
        logger.error('WebSocket error', {
          socketId: socket.id,
          error: error instanceof Error ? error.message : error
        });
      });
    });

    this.io.engine.on('connection_error', (error) => {
      logger.error('WebSocket connection error', {
        error: error.message,
        code: error.code,
        context: error.context
      });
    });
  }

  private startRevocationMonitoring(): void {
    // Check for revocation updates every 30 seconds
    this.revocationCheckInterval = setInterval(async () => {
      try {
        await this.checkForRevocationUpdates();
      } catch (error) {
        logger.error('Revocation monitoring error', {
          error: error instanceof Error ? error.message : error
        });
      }
    }, 30000);

    logger.info('Revocation monitoring started');
  }

  private async checkForRevocationUpdates(): Promise<void> {
    // In a real implementation, you would:
    // 1. Query the latest revocation lists from trusted issuers
    // 2. Compare with cached versions
    // 3. Identify newly revoked credentials
    // 4. Notify subscribed clients

    // For this example, we'll simulate checking a few credentials
    const sampleCredentialIds = await this.getSampleCredentialIds();
    
    if (sampleCredentialIds.length === 0) {
      return;
    }

    try {
      const revocationResults = await this.serviceProvider.batchCheckRevocations(sampleCredentialIds);
      
      revocationResults.forEach((isRevoked, credentialId) => {
        if (isRevoked) {
          // Notify all clients subscribed to this credential
          this.io.to(`credential:${credentialId}`).emit('credential:status', {
            credentialId,
            isRevoked: true,
            status: 'revoked',
            timestamp: Date.now(),
            reason: 'Periodic revocation check'
          });

          logger.info('Revocation notification sent', {
            credentialId,
            subscriberCount: this.io.sockets.adapter.rooms.get(`credential:${credentialId}`)?.size || 0
          });
        }
      });
    } catch (error) {
      logger.error('Failed to check revocation updates', {
        credentialIds: sampleCredentialIds,
        error: error instanceof Error ? error.message : error
      });
    }
  }

  private async getSampleCredentialIds(): Promise<string[]> {
    // In a real implementation, you would get this from:
    // 1. Active session credentials
    // 2. Recently verified credentials
    // 3. Subscribed credentials from cache
    
    // For this example, return empty array (no periodic checks)
    return [];
  }

  // Public methods for manual notification triggers

  public notifyCredentialRevoked(credentialId: string, issuerDID?: string): void {
    // Notify credential subscribers
    this.io.to(`credential:${credentialId}`).emit('credential:status', {
      credentialId,
      isRevoked: true,
      status: 'revoked',
      timestamp: Date.now(),
      reason: 'Manual revocation notification'
    });

    // Notify issuer subscribers if issuerDID provided
    if (issuerDID) {
      this.io.to(`issuer:${issuerDID}`).emit('issuer:revocation', {
        issuerDID,
        credentialId,
        timestamp: Date.now()
      });
    }

    logger.info('Manual revocation notification sent', {
      credentialId,
      issuerDID,
      credentialSubscribers: this.io.sockets.adapter.rooms.get(`credential:${credentialId}`)?.size || 0,
      issuerSubscribers: issuerDID ? this.io.sockets.adapter.rooms.get(`issuer:${issuerDID}`)?.size || 0 : 0
    });
  }

  public notifySessionExpired(sessionId: string): void {
    this.io.to(`session:${sessionId}`).emit('session:status', {
      sessionId,
      isValid: false,
      status: 'expired',
      timestamp: Date.now()
    });

    logger.info('Session expiration notification sent', {
      sessionId,
      subscribers: this.io.sockets.adapter.rooms.get(`session:${sessionId}`)?.size || 0
    });
  }

  public getConnectedClients(): number {
    return this.io.engine.clientsCount;
  }

  public getSubscriptionStats(): Record<string, number> {
    const rooms = this.io.sockets.adapter.rooms;
    const stats: Record<string, number> = {
      credentialSubscriptions: 0,
      issuerSubscriptions: 0,
      sessionSubscriptions: 0,
      totalConnections: this.io.engine.clientsCount
    };

    rooms.forEach((sockets, room) => {
      if (room.startsWith('credential:')) {
        stats.credentialSubscriptions++;
      } else if (room.startsWith('issuer:')) {
        stats.issuerSubscriptions++;
      } else if (room.startsWith('session:')) {
        stats.sessionSubscriptions++;
      }
    });

    return stats;
  }

  public shutdown(): void {
    if (this.revocationCheckInterval) {
      clearInterval(this.revocationCheckInterval);
      this.revocationCheckInterval = null;
    }

    this.io.close();
    logger.info('WebSocket server shut down');
  }
}

export default WebSocketServer;