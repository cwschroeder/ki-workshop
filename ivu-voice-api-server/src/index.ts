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
import sipRoutes from './api/sip.routes';
import monitorRoutes from './api/monitor.routes';
import { getSIPVoiceService } from './services/SIPVoiceService';
import { getMonitorService } from './services/MonitorService';

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

// SIP Voice Bot routes
app.use('/api/sip', sipRoutes);

// Monitor (Passive Listener) routes
app.use('/api/monitor', monitorRoutes);

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

httpServer.listen(PORT, async () => {
  console.log('\n✅ IVU Voice API Server started\n');
  console.log(`📡 HTTP Server: http://localhost:${PORT}`);
  console.log(`🔌 WebSocket Server: ws://localhost:${PORT}`);
  console.log(`📝 Environment: ${env.NODE_ENV}`);
  console.log(`📁 Workshop Data: ${env.WORKSHOP_DATA_DIR}\n`);
  console.log('📋 Endpoints:');
  console.log(`   GET  /health               - Health check`);
  console.log(`   POST /api/webhook          - TENIOS webhook`);
  console.log(`   GET  /api/sessions         - List sessions`);
  console.log(`   POST /api/sessions/cleanup - Cleanup inactive`);
  console.log(`   GET  /api/sip/status       - SIP service status`);
  console.log(`   GET  /api/sip/providers    - Available providers`);
  console.log(`   GET  /api/sip/calls        - Active SIP calls`);
  console.log(`   POST /api/sip/start        - Start SIP service`);
  console.log(`   GET  /api/monitor/status   - Monitor service status`);
  console.log(`   GET  /api/monitor/sessions - Active monitor sessions`);
  console.log(`   POST /api/monitor/start    - Start monitor service\n`);

  // Auto-start SIP service based on mode
  if (env.SIP_ENABLED) {
    const mode = env.SIP_MODE;

    // Start Voice Bot (active agent) if mode is 'voicebot' or 'both'
    if (mode === 'voicebot' || mode === 'both') {
      console.log('📞 Starting SIP Voice Bot Service...');
      try {
        const sipService = getSIPVoiceService();
        await sipService.start();

        // Forward SIP events to WebSocket
        sipService.on('callStarted', (data) => {
          io.emit('sip.callStarted', data);
        });
        sipService.on('callEnded', (data) => {
          io.emit('sip.callEnded', data);
        });
        sipService.on('transcription', (data) => {
          io.emit('sip.transcription', data);
        });
        sipService.on('agentResponse', (data) => {
          io.emit('sip.agentResponse', data);
        });

        console.log('📞 SIP Voice Bot Service started');
      } catch (error) {
        console.error('❌ Failed to start Voice Bot service:', error);
      }
    }

    // Start Monitor (passive listener) if mode is 'monitor' or 'both'
    if (mode === 'monitor' || mode === 'both') {
      console.log('👂 Starting Monitor Service (Passive Listener)...');
      try {
        const monitorService = getMonitorService();
        await monitorService.start();

        // Forward Monitor events to WebSocket
        monitorService.on('sessionStarted', (data) => {
          io.emit('monitor.sessionStarted', data);
        });
        monitorService.on('sessionEnded', (data) => {
          io.emit('monitor.sessionEnded', data);
        });
        monitorService.on('transcription', (data) => {
          io.emit('monitor.transcription', data);
        });
        monitorService.on('error', (data) => {
          console.error('[Monitor] Error:', data.error?.message || data);
          io.emit('monitor.error', data);
        });

        console.log('👂 Monitor Service started - ready for incoming calls');
      } catch (error) {
        console.error('❌ Failed to start Monitor service:', error);
      }
    }
  }

  console.log('\n🎯 Ready for workshop! Connect clients to ws://localhost:' + PORT);
});

// Cleanup on shutdown
process.on('SIGINT', async () => {
  console.log('\n\n🛑 Shutting down gracefully...');

  // Stop SIP service
  if (env.SIP_ENABLED) {
    const sipService = getSIPVoiceService();
    await sipService.stop();
    console.log('✅ SIP service stopped');
  }

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
