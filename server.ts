import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './lib/config/endpoints';
import { createSocketHandlers } from './lib/server/socketHandlers';
import { setSocketIOInstance } from './lib/server/socketEmitter';
import { AuthenticatedSocket } from './types/socket';
import { memoryMonitor } from './lib/monitoring/memoryMonitor';
import { memoryProfiler } from './lib/monitoring/memoryProfiler';
import { safeCleanup } from './lib/monitoring/safeCleanup';
import EmergencyMemoryCleanup from './lib/utils/memoryCleanup';

const dev = process.env.NODE_ENV !== 'production';
const hostname = 'localhost';
const port = parseInt(process.env.PORT || '3000', 10);

// Initialize Next.js app
const app = next({ dev, hostname, port });
const handle = app.getRequestHandler();

app.prepare().then(() => {
  const server = createServer(async (req, res) => {
    try {
      const parsedUrl = parse(req.url!, true);
      await handle(req, res, parsedUrl);
    } catch (err) {
      console.error('Error occurred handling', req.url, err);
      res.statusCode = 500;
      res.end('internal server error');
    }
  });

  // Initialize Socket.IO with production-ready configuration
  const io = new SocketIOServer(server, {
    cors: {
      origin: dev 
        ? ["http://localhost:3000", "http://localhost:3001"] 
        : [config.socketIO.clientUrl],
      methods: ["GET", "POST"],
      credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: config.socketIO.timeout,
    pingInterval: 25000,
    connectTimeout: config.socketIO.timeout,
    allowEIO3: true
  });

  // Authentication middleware
  io.use(async (socket, next) => {
    try {
      // Extract auth token from handshake
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;
      
      if (!token) {
        return next(new Error('Authentication token required'));
      }

      // TODO: Validate token with existing auth system
      // For now, we'll accept any token to maintain MVP approach
      (socket as AuthenticatedSocket).userId = token; // Simplified for MVP
      next();
    } catch (error) {
      console.error('Socket authentication error:', error);
      next(new Error('Authentication failed'));
    }
  });

  // Set the global Socket.IO instance for API routes to use
  setSocketIOInstance(io);

  // Initialize socket handlers
  const socketHandlers = createSocketHandlers(io);

  // Connection handling with structured event management
  io.on('connection', (socket) => {
    const authSocket = socket as AuthenticatedSocket;
    
    // Handle connection
    socketHandlers.handleConnection(authSocket);

    // Handle connection errors
    socket.on('error', (error) => {
      console.error(`Socket error for user ${authSocket.userId}:`, error);
    });

    // Handle disconnection
    socket.on('disconnect', (reason) => {
      socketHandlers.handleDisconnection(authSocket, reason);
    });
  });

  // Graceful shutdown handling
  const gracefulShutdown = async (signal: string) => {
    console.log(`\n🛑 Received ${signal}, starting graceful shutdown...`);
    
    try {
      // 1. Stop accepting new connections
      server.close(() => {
        console.log('✅ HTTP server closed');
      });
      
      // 2. Close Socket.IO connections
      if (io) {
        console.log('🔌 Closing Socket.IO connections...');
        io.close(() => {
          console.log('✅ Socket.IO server closed');
        });
      }
      
      // 3. Cleanup monitoring systems
      console.log('🧹 Cleaning up monitoring systems...');
      safeCleanup.shutdown();
      memoryMonitor.cleanup();
      
      // 4. Final memory cleanup
      await EmergencyMemoryCleanup.performEmergencyCleanup();
      
      console.log('✅ Graceful shutdown completed');
      process.exit(0);
    } catch (error) {
      console.error('❌ Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Global error handling
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    // Try emergency cleanup before exit
    EmergencyMemoryCleanup.performEmergencyCleanup().finally(() => {
      process.exit(1);
    });
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    // Try emergency cleanup before exit
    EmergencyMemoryCleanup.performEmergencyCleanup().finally(() => {
      process.exit(1);
    });
  });

  server
    .once('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      console.log(`> Ready on http://${hostname}:${port}`);
      console.log(`> Socket.IO server initialized`);
      
      // Initialize memory monitoring and safe cleanup
      console.log('🔍 Initializing memory monitoring and safe cleanup...');
      const initialMemory = memoryMonitor.getCurrentStats();
      console.log(`📊 Initial memory usage: ${Math.round(initialMemory.heapUsed / 1024 / 1024)}MB`);
      
      // Initialize safe cleanup system
      console.log('🧹 Safe auto-cleanup system initialized');
      
      // Check if we're starting with high memory
      if (memoryMonitor.isMemoryHigh()) {
        console.warn('⚠️ Starting with high memory usage - running analysis and cleanup...');
        setTimeout(async () => {
          memoryProfiler.logMemoryReport();
          // Trigger immediate safe cleanup
          await safeCleanup.triggerManualCleanup();
        }, 5000); // Wait 5 seconds for everything to initialize
      }
    });
});