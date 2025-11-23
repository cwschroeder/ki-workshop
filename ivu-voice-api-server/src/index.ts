/**
 * IVU Voice API Server
 *
 * Main entry point for the workshop voice API server.
 * Provides WebSocket and REST endpoints for workshop clients.
 */

import express from 'express';
import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env';
import { SessionManager } from './services/SessionManager';
import { IVUVoiceService } from './services/IVUVoiceService';
import { VoiceWebSocketHandler } from './websocket/VoiceWebSocketHandler';
import { createWebhookRouter } from './api/webhook.routes';
import { createAIProvider, createTelephonyProvider } from './providers/ProviderFactory';

// Create Express app
const app = express();
const httpServer = createServer(app);

// Setup Socket.IO
const io = new SocketIOServer(httpServer, {
  cors: {
    origin: env.ENABLE_CORS ? '*' : false,
    methods: ['GET', 'POST']
  },
  transports: ['websocket', 'polling']
});

// Middleware
app.use(helmet());
if (env.ENABLE_CORS) {
  app.use(cors());
}
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request logging
app.use((req, res, next) => {
  console.log(`[HTTP] ${req.method} ${req.path}`);
  next();
});

// Initialize services
console.log('🚀 Initializing IVU Voice API Server...\n');

const sessionManager = new SessionManager();
const aiProvider = createAIProvider();
const telephonyProvider = createTelephonyProvider();
const voiceService = new IVUVoiceService(sessionManager, aiProvider, telephonyProvider);
const wsHandler = new VoiceWebSocketHandler(io, sessionManager, voiceService);

console.log(`✅ Providers initialized:`);
console.log(`   - AI: ${aiProvider.name}`);
console.log(`   - Telephony: ${telephonyProvider.name}\n`);

// REST API Routes

// Health check
app.get('/health', (_req, res) => {
  const stats = sessionManager.getStats();

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    ...stats,
    providers: {
      ai: aiProvider.name,
      telephony: telephonyProvider.name
    }
  });
});

// Webhook routes
app.use('/api', createWebhookRouter(sessionManager, voiceService, telephonyProvider, wsHandler));

// Session info endpoint
app.get('/api/sessions', (_req, res) => {
  const sessions = sessionManager.getAllSessions();

  res.json({
    count: sessions.length,
    sessions: sessions.map((s) => ({
      sessionId: s.sessionId,
      userId: s.userId,
      assignedPhoneNumber: s.assignedPhoneNumber,
      activeCallId: s.activeCallId,
      createdAt: s.createdAt,
      lastActivityAt: s.lastActivityAt
    }))
  });
});

// Session cleanup endpoint (for admin/testing)
app.post('/api/sessions/cleanup', (_req, res) => {
  const cleaned = sessionManager.cleanupInactiveSessions();
  res.json({ cleaned, message: `Cleaned up ${cleaned} inactive sessions` });
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[Error]', err);
  res.status(500).json({
    error: 'Internal server error',
    message: env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// Start server
const PORT = env.PORT;

httpServer.listen(PORT, () => {
  console.log('\n✅ IVU Voice API Server started\n');
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log(`📝 Environment: ${env.NODE_ENV}`);
  console.log(`📁 Workshop Data: ${env.WORKSHOP_DATA_DIR}\n`);
  console.log('📋 Endpoints:');
  console.log(`   GET  /health              - Health check`);
  console.log(`   POST /api/webhook         - TENIOS webhook`);
  console.log(`   GET  /api/sessions        - List sessions`);
  console.log(`   POST /api/sessions/cleanup - Cleanup inactive\n`);
  console.log('🎯 Ready for workshop! Connect clients to ws://localhost:' + PORT);
});

// Cleanup on shutdown
process.on('SIGINT', () => {
  console.log('\n\n🛑 Shutting down gracefully...');

  // Disconnect all sessions
  const sessions = sessionManager.getAllSessions();
  sessions.forEach((s) => sessionManager.deleteSession(s.sessionId));

  httpServer.close(() => {
    console.log('✅ Server closed');
    process.exit(0);
  });
});

// Periodic cleanup (every hour)
setInterval(() => {
  const cleaned = sessionManager.cleanupInactiveSessions();
  if (cleaned > 0) {
    console.log(`🧹 Periodic cleanup: removed ${cleaned} inactive sessions`);
  }
}, 3600000);
