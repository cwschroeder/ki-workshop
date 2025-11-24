/**
 * Voice WebSocket Handler
 *
 * Handles WebSocket connections from workshop clients.
 * Manages bidirectional communication for voice session control.
 */

import type { Server as SocketIOServer, Socket } from 'socket.io';
import type { SessionManager } from '../services/SessionManager';
import type { IVUVoiceService } from '../services/IVUVoiceService';
import type { CallAction } from '../models/CallAction';

export class VoiceWebSocketHandler {
  constructor(
    private io: SocketIOServer,
    private sessionManager: SessionManager,
    private voiceService: IVUVoiceService
  ) {
    this.setupConnectionHandler();
  }

  /**
   * Setup main connection handler
   */
  private setupConnectionHandler(): void {
    this.io.on('connection', (socket: Socket) => {
      console.log(`[WebSocket] Client connected: ${socket.id}`);

      // Extract user info from handshake (if provided)
      const userId = socket.handshake.auth?.userId as string | undefined;

      // Create session for this connection
      const session = this.sessionManager.createSession(socket, userId);

      console.log(`[WebSocket] Created session ${session.sessionId} for socket ${socket.id}`);

      // Send session info to client
      socket.emit('session.created', {
        sessionId: session.sessionId,
        createdAt: session.createdAt
      });

      // Setup event handlers for this socket
      this.setupSessionHandlers(socket, session.sessionId);

      // Handle disconnection
      socket.on('disconnect', (reason) => {
        console.log(`[WebSocket] Client disconnected: ${socket.id}, reason: ${reason}`);
        this.sessionManager.deleteSession(session.sessionId);
      });
    });

    console.log('[WebSocket] Connection handler setup complete');
  }

  /**
   * Setup event handlers for a specific session
   */
  private setupSessionHandlers(socket: Socket, sessionId: string): void {
    // Client sends actions to control calls
    socket.on('call.action', async (action: CallAction, callback) => {
      try {
        console.log(`[WebSocket] Action received: ${action.type} (${sessionId})`);

        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          callback({ error: 'Session not found' });
          return;
        }

        // Initialize action queue if it doesn't exist
        if (!session.metadata.pendingActions) {
          session.metadata.pendingActions = [];
        }

        // Add action to queue
        session.metadata.pendingActions.push(action);

        callback({ success: true });
      } catch (error) {
        console.error('[WebSocket] Error handling action:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client requests session info
    socket.on('session.info', (callback) => {
      const session = this.sessionManager.getSession(sessionId);
      if (!session) {
        callback({ error: 'Session not found' });
        return;
      }

      callback({
        sessionId: session.sessionId,
        assignedPhoneNumber: session.assignedPhoneNumber,
        activeCallId: session.activeCallId,
        createdAt: session.createdAt,
        lastActivityAt: session.lastActivityAt
      });
    });

    // Client requests to assign phone number
    socket.on('phone.assign', (phoneNumber: string, callback) => {
      try {
        this.sessionManager.assignPhoneNumber(sessionId, phoneNumber);
        callback({ success: true, phoneNumber });
      } catch (error) {
        console.error('[WebSocket] Error assigning phone:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client requests to make an outbound call
    socket.on('call.make', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] Making outbound call: ${options.destinationNumber} (${sessionId})`);

        const result = await this.voiceService.makeCall(options);
        callback({ success: true, callbackId: result.id });
      } catch (error) {
        console.error('[WebSocket] Error making call:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client requests to send SMS
    socket.on('sms.send', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] Sending SMS to: ${options.to} (${sessionId})`);

        const result = await this.voiceService.sendSMS(options);
        callback({ success: true, messageUri: result.messageUri, status: result.status });
      } catch (error) {
        console.error('[WebSocket] Error sending SMS:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client requests to start call recording
    console.log(`[WebSocket] Registering 'recording.start' handler for session ${sessionId}`);
    socket.on('recording.start', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] Recording.start event received! Options:`, options);
        console.log(`[WebSocket] Starting recording for call: ${options.callUuid} (${sessionId})`);

        const result = await this.voiceService.startRecording(options);
        callback({ success: true, recordingUuid: result.recordingUuid });
      } catch (error) {
        console.error('[WebSocket] Error starting recording:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client requests to stop call recording
    socket.on('recording.stop', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] Stopping recording: ${options.recordingUuid} (${sessionId})`);

        const result = await this.voiceService.stopRecording(options);
        callback({ success: result.success });
      } catch (error) {
        console.error('[WebSocket] Error stopping recording:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client requests to retrieve call recording
    socket.on('recording.retrieve', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] Retrieving recording: ${options.recordingUuid} (${sessionId})`);

        const result = await this.voiceService.retrieveRecording(options);

        // Convert Buffer to base64 for transmission over WebSocket
        const base64Data = result.data.toString('base64');

        callback({
          success: true,
          data: base64Data,
          contentType: result.contentType
        });
      } catch (error) {
        console.error('[WebSocket] Error retrieving recording:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Ping/pong for keepalive
    socket.on('ping', (callback) => {
      this.sessionManager.updateActivity(sessionId);
      callback({ pong: true, timestamp: Date.now() });
    });
  }

  /**
   * Emit event to specific session
   */
  emitToSession(sessionId: string, event: string, data: any): boolean {
    const session = this.sessionManager.getSession(sessionId);
    if (!session || !session.socket) {
      console.warn(`[WebSocket] Cannot emit to session ${sessionId}: not found or no socket`);
      return false;
    }

    session.socket.emit(event, data);
    return true;
  }

  /**
   * Emit call.incoming event to session associated with phone number
   */
  emitCallIncoming(phoneNumber: string, callId: string, callData: any): boolean {
    const session = this.sessionManager.getSessionByPhone(phoneNumber);
    if (!session) {
      console.warn(`[WebSocket] No session found for phone ${phoneNumber}`);
      return false;
    }

    // Register call with session
    this.sessionManager.registerCall(session.sessionId, callId);

    // Emit to client
    if (session.socket) {
      session.socket.emit('call.incoming', {
        callId,
        sessionId: session.sessionId,
        ...callData
      });
      return true;
    }

    return false;
  }

  /**
   * Emit call.ended event
   */
  emitCallEnded(callId: string): boolean {
    const session = this.sessionManager.getSessionByCallId(callId);
    if (!session) {
      return false;
    }

    this.sessionManager.endCall(callId);

    if (session.socket) {
      session.socket.emit('call.ended', { callId });
      return true;
    }

    return false;
  }

  /**
   * Get IO instance for custom events
   */
  getIO(): SocketIOServer {
    return this.io;
  }
}
