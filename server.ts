import 'dotenv/config';
import { createServer } from 'http';
import { parse } from 'url';
import next from 'next';
import { Server as SocketIOServer } from 'socket.io';
import { config } from './lib/config/endpoints';
import { createSocketHandlers } from './lib/server/socketHandlers';
import { setSocketIOInstance } from './lib/server/socketEmitter';
import type { AuthenticatedSocket } from './types/socket';
import { MemoryManager } from './lib/monitoring/memoryManager';
import { AlertSystem } from './lib/monitoring/alertSystem';
import { MemoryProtection } from './lib/monitoring/memoryProtection';

// Print masked key so we can confirm availability at process start
try {
  const k = process.env.OPENROUTER_API_KEY || '';
  const masked = k ? `${k.slice(0, 6)}…${k.slice(-4)}` : 'MISSING';
console.log(` OPENROUTER_API_KEY (server.ts): ${masked}`);
} catch {}

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
      origin: [config.socketIO.clientUrl],
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

  // Initialize monitoring and protection systems
  const memoryManager = MemoryManager.getInstance();
  const alertSystem = AlertSystem.getInstance();
  const memoryProtection = MemoryProtection.getInstance();
  
  console.log('Memory Manager initialized with adaptive monitoring');
console.log('Memory Protection initialized with emergency mode');
console.log('Alert System initialized with updated thresholds');

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
// Starting graceful shutdown
    
    try {
      // 1. Stop accepting new connections
      server.close(() => {
// HTTP server closed
      });
      
      // 2. Close Socket.IO connections
      if (io) {
// Closing Socket.IO connections
        io.close(() => {
// Socket.IO server closed
        });
      }
      
      // 3. Cleanup monitoring systems
      // Cleaning up monitoring systems
      memoryManager.cleanup();
      alertSystem.cleanup();
      memoryProtection.cleanup();
      
// Graceful shutdown completed
      process.exit(0);
    } catch (error) {
console.error(' Error during graceful shutdown:', error);
      process.exit(1);
    }
  };

  // Handle shutdown signals
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
  process.on('SIGINT', () => gracefulShutdown('SIGINT'));

  // Global error handling
  process.on('uncaughtException', (error) => {
    console.error('Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    console.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  });

  server
    .once('error', (err) => {
      console.error('Server error:', err);
      process.exit(1);
    })
    .listen(port, () => {
      // Server ready
      // Socket.IO server initialized
      
      // Socket.IO server initialized with monitoring
    });
});