import { Server as SocketIOServer } from 'socket.io';
import { Server as HttpServer } from 'http';
import WebSocketServer from '../../src/websocket.server';
import ServiceProviderService from '../../src/services/service-provider.service';
import CacheService from '../../src/services/cache.service';

// Mock dependencies
jest.mock('socket.io');
jest.mock('../../src/services/service-provider.service');
jest.mock('../../src/services/cache.service');

describe('WebSocketServer', () => {
  let webSocketServer: WebSocketServer;
  let mockHttpServer: HttpServer;
  let mockSocketIOServer: jest.Mocked<SocketIOServer>;
  let mockServiceProvider: jest.Mocked<ServiceProviderService>;
  let mockCacheService: jest.Mocked<CacheService>;
  let mockSocket: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Mock HTTP server
    mockHttpServer = {
      listen: jest.fn(),
      close: jest.fn()
    } as any;

    // Mock Socket.IO server
    mockSocketIOServer = {
      on: jest.fn(),
      emit: jest.fn(),
      close: jest.fn(),
      sockets: {
        emit: jest.fn()
      },
      to: jest.fn().mockReturnThis(),
      engine: {
        on: jest.fn()
      }
    } as any;

    // Mock socket instance
    mockSocket = {
      id: 'socket-123',
      handshake: {
        address: '127.0.0.1',
        headers: {
          'user-agent': 'Test Client'
        },
        query: {}
      },
      on: jest.fn(),
      emit: jest.fn(),
      join: jest.fn(),
      leave: jest.fn(),
      disconnect: jest.fn(),
      rooms: new Set()
    };

    // Mock service dependencies
    mockServiceProvider = {
      validateSession: jest.fn(),
      getSession: jest.fn(),
      checkCredentialStatus: jest.fn()
    } as any;

    mockCacheService = {
      incrementCounter: jest.fn(),
      get: jest.fn(),
      set: jest.fn()
    } as any;

    // Mock Socket.IO constructor
    (SocketIOServer as jest.MockedClass<typeof SocketIOServer>).mockImplementation(() => mockSocketIOServer);

    webSocketServer = new WebSocketServer(mockHttpServer, mockServiceProvider, mockCacheService);

    // Mock console methods
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should initialize Socket.IO server with correct configuration', () => {
      expect(SocketIOServer).toHaveBeenCalledWith(mockHttpServer, {
        cors: {
          origin: '*',
          methods: ['GET', 'POST']
        },
        transports: ['websocket', 'polling'],
        allowEIO3: true
      });
    });

    it('should set up connection event handler', () => {
      expect(mockSocketIOServer.on).toHaveBeenCalledWith('connection', expect.any(Function));
    });
  });

  describe('connection handling', () => {
    beforeEach(() => {
      // Simulate connection event
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }
    });

    it('should handle new socket connections', () => {
      expect(console.log).toHaveBeenCalledWith('Client connected:', mockSocket.id);
      expect(mockCacheService.incrementCounter).toHaveBeenCalledWith('websocket_connections');
    });

    it('should set up socket event handlers', () => {
      expect(mockSocket.on).toHaveBeenCalledWith('authenticate', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('subscribe:credential', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('subscribe:session', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('unsubscribe:credential', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('unsubscribe:session', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('get:status', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('disconnect', expect.any(Function));
      expect(mockSocket.on).toHaveBeenCalledWith('error', expect.any(Function));
    });
  });

  describe('authentication', () => {
    let authenticateHandler: Function;

    beforeEach(() => {
      // Get the connection handler and simulate connection
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      // Get the authenticate handler
      authenticateHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'authenticate'
      )?.[1];
    });

    it('should authenticate valid session', async () => {
      const sessionId = 'session-123';
      const mockSession = {
        id: sessionId,
        holderDID: 'did:test:holder',
        attributes: { age: 25 }
      };

      mockServiceProvider.validateSession.mockResolvedValue(true);
      mockServiceProvider.getSession.mockResolvedValue(mockSession);

      await authenticateHandler({ sessionId });

      expect(mockServiceProvider.validateSession).toHaveBeenCalledWith(sessionId);
      expect(mockServiceProvider.getSession).toHaveBeenCalledWith(sessionId);
      expect(mockSocket.join).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('authenticated', {
        success: true,
        sessionId,
        holderDID: 'did:test:holder'
      });
    });

    it('should reject invalid session', async () => {
      mockServiceProvider.validateSession.mockResolvedValue(false);

      await authenticateHandler({ sessionId: 'invalid-session' });

      expect(mockSocket.emit).toHaveBeenCalledWith('authentication_error', {
        success: false,
        error: 'Invalid session'
      });
    });

    it('should handle missing sessionId', async () => {
      await authenticateHandler({});

      expect(mockSocket.emit).toHaveBeenCalledWith('authentication_error', {
        success: false,
        error: 'Session ID required'
      });
    });

    it('should handle authentication errors', async () => {
      mockServiceProvider.validateSession.mockRejectedValue(new Error('Service error'));

      await authenticateHandler({ sessionId: 'session-123' });

      expect(mockSocket.emit).toHaveBeenCalledWith('authentication_error', {
        success: false,
        error: 'Authentication failed'
      });
    });
  });

  describe('credential subscription', () => {
    let subscribeCredentialHandler: Function;

    beforeEach(() => {
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      subscribeCredentialHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'subscribe:credential'
      )?.[1];
    });

    it('should subscribe to credential updates', async () => {
      const credentialId = 'cred-123';
      mockServiceProvider.checkCredentialStatus.mockResolvedValue({
        id: credentialId,
        isRevoked: false,
        isValid: true
      });

      await subscribeCredentialHandler({ credentialId });

      expect(mockSocket.join).toHaveBeenCalledWith(`credential:${credentialId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('subscription_confirmed', {
        type: 'credential',
        id: credentialId,
        status: {
          id: credentialId,
          isRevoked: false,
          isValid: true
        }
      });
    });

    it('should handle invalid credential subscription', async () => {
      await subscribeCredentialHandler({});

      expect(mockSocket.emit).toHaveBeenCalledWith('subscription_error', {
        error: 'Credential ID required'
      });
    });

    it('should handle credential status check errors', async () => {
      mockServiceProvider.checkCredentialStatus.mockRejectedValue(new Error('Status check failed'));

      await subscribeCredentialHandler({ credentialId: 'cred-123' });

      expect(mockSocket.emit).toHaveBeenCalledWith('subscription_error', {
        error: 'Failed to check credential status'
      });
    });
  });

  describe('session subscription', () => {
    let subscribeSessionHandler: Function;

    beforeEach(() => {
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      subscribeSessionHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'subscribe:session'
      )?.[1];
    });

    it('should subscribe to session updates', async () => {
      const sessionId = 'session-123';

      await subscribeSessionHandler({ sessionId });

      expect(mockSocket.join).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('subscription_confirmed', {
        type: 'session',
        id: sessionId
      });
    });

    it('should handle invalid session subscription', async () => {
      await subscribeSessionHandler({});

      expect(mockSocket.emit).toHaveBeenCalledWith('subscription_error', {
        error: 'Session ID required'
      });
    });
  });

  describe('unsubscription', () => {
    let unsubscribeCredentialHandler: Function;
    let unsubscribeSessionHandler: Function;

    beforeEach(() => {
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      unsubscribeCredentialHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'unsubscribe:credential'
      )?.[1];

      unsubscribeSessionHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'unsubscribe:session'
      )?.[1];
    });

    it('should unsubscribe from credential updates', async () => {
      const credentialId = 'cred-123';

      await unsubscribeCredentialHandler({ credentialId });

      expect(mockSocket.leave).toHaveBeenCalledWith(`credential:${credentialId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscription_confirmed', {
        type: 'credential',
        id: credentialId
      });
    });

    it('should unsubscribe from session updates', async () => {
      const sessionId = 'session-123';

      await unsubscribeSessionHandler({ sessionId });

      expect(mockSocket.leave).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(mockSocket.emit).toHaveBeenCalledWith('unsubscription_confirmed', {
        type: 'session',
        id: sessionId
      });
    });
  });

  describe('status requests', () => {
    let getStatusHandler: Function;

    beforeEach(() => {
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      getStatusHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'get:status'
      )?.[1];
    });

    it('should return credential status', async () => {
      const credentialId = 'cred-123';
      const mockStatus = {
        id: credentialId,
        isRevoked: false,
        isValid: true,
        lastChecked: new Date().toISOString()
      };

      mockServiceProvider.checkCredentialStatus.mockResolvedValue(mockStatus);

      await getStatusHandler({ type: 'credential', id: credentialId });

      expect(mockSocket.emit).toHaveBeenCalledWith('status_response', {
        type: 'credential',
        id: credentialId,
        status: mockStatus
      });
    });

    it('should handle invalid status request', async () => {
      await getStatusHandler({ type: 'invalid' });

      expect(mockSocket.emit).toHaveBeenCalledWith('status_error', {
        error: 'Invalid status request type'
      });
    });
  });

  describe('disconnect handling', () => {
    let disconnectHandler: Function;

    beforeEach(() => {
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      disconnectHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'disconnect'
      )?.[1];
    });

    it('should handle client disconnect', () => {
      disconnectHandler('client disconnect');

      expect(console.log).toHaveBeenCalledWith('Client disconnected:', mockSocket.id, 'Reason: client disconnect');
    });
  });

  describe('error handling', () => {
    let errorHandler: Function;

    beforeEach(() => {
      const connectionHandler = mockSocketIOServer.on.mock.calls.find(
        call => call[0] === 'connection'
      )?.[1];
      
      if (connectionHandler) {
        connectionHandler(mockSocket);
      }

      errorHandler = mockSocket.on.mock.calls.find(
        call => call[0] === 'error'
      )?.[1];
    });

    it('should handle socket errors', () => {
      const error = new Error('Socket error');

      errorHandler(error);

      expect(console.error).toHaveBeenCalledWith('Socket error:', mockSocket.id, error);
    });
  });

  describe('broadcasting methods', () => {
    it('should broadcast credential status update', () => {
      const credentialId = 'cred-123';
      const status = {
        id: credentialId,
        isRevoked: true,
        revokedAt: new Date().toISOString()
      };

      webSocketServer.broadcastCredentialStatus(credentialId, status);

      expect(mockSocketIOServer.to).toHaveBeenCalledWith(`credential:${credentialId}`);
      expect(mockSocketIOServer.emit).toHaveBeenCalledWith('credential:status', {
        credentialId,
        status,
        timestamp: expect.any(String)
      });
    });

    it('should broadcast session update', () => {
      const sessionId = 'session-123';
      const update = {
        type: 'extended',
        newExpiresAt: new Date().toISOString()
      };

      webSocketServer.broadcastSessionUpdate(sessionId, update);

      expect(mockSocketIOServer.to).toHaveBeenCalledWith(`session:${sessionId}`);
      expect(mockSocketIOServer.emit).toHaveBeenCalledWith('session:update', {
        sessionId,
        update,
        timestamp: expect.any(String)
      });
    });

    it('should broadcast verification event', () => {
      const event = {
        type: 'presentation_verified',
        sessionId: 'session-123',
        credentialIds: ['cred-1', 'cred-2']
      };

      webSocketServer.broadcastVerificationEvent(event);

      expect(mockSocketIOServer.sockets.emit).toHaveBeenCalledWith('verification:event', {
        ...event,
        timestamp: expect.any(String)
      });
    });
  });

  describe('server management', () => {
    it('should close server gracefully', async () => {
      mockSocketIOServer.close.mockImplementation((callback) => {
        if (callback) callback();
        return mockSocketIOServer;
      });

      await webSocketServer.close();

      expect(mockSocketIOServer.close).toHaveBeenCalledWith(expect.any(Function));
      expect(console.log).toHaveBeenCalledWith('WebSocket server closed');
    });

    it('should handle close errors', async () => {
      const error = new Error('Close failed');
      mockSocketIOServer.close.mockImplementation((callback) => {
        if (callback) callback(error);
        return mockSocketIOServer;
      });

      await expect(webSocketServer.close()).rejects.toThrow('Close failed');
    });
  });
});