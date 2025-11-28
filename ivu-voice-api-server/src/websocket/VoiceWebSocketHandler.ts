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

    // Client sends audio for STT transcription
    socket.on('stt.transcribe', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] STT transcribe request (${sessionId}), audio size: ${options.audio?.length || 0} bytes`);

        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          callback({ error: 'Session not found' });
          return;
        }

        // Convert base64 audio to Buffer
        const audioBuffer = Buffer.from(options.audio, 'base64');

        // Call AI provider's transcribe method
        const text = await (this.voiceService as any).aiProvider.transcribe(audioBuffer, {
          language: options.language || 'de-DE',
          model: options.model
        });

        console.log(`[WebSocket] STT result (${sessionId}): "${text.substring(0, 50)}..."`);

        callback({
          success: true,
          text: text
        });
      } catch (error) {
        console.error('[WebSocket] Error transcribing audio:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client sends text for TTS synthesis
    socket.on('tts.synthesize', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] TTS synthesize request (${sessionId}): "${options.text?.substring(0, 50)}..."`);

        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          callback({ error: 'Session not found' });
          return;
        }

        // Call AI provider's synthesize method
        const audioBuffer = await (this.voiceService as any).aiProvider.synthesize(options.text, {
          voice: options.voice || 'alloy',
          language: options.language || 'de-DE',
          speed: options.speed || 1.0
        });

        // Convert Buffer to base64 for transmission
        const base64Audio = audioBuffer.toString('base64');

        console.log(`[WebSocket] TTS result (${sessionId}): ${audioBuffer.length} bytes`);

        callback({
          success: true,
          audio: base64Audio,
          contentType: 'audio/mp3'
        });
      } catch (error) {
        console.error('[WebSocket] Error synthesizing audio:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client sends chat message for AI processing
    socket.on('chat.message', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] Chat message received (${sessionId}):`, options.userMessage?.substring(0, 50));

        const session = this.sessionManager.getSession(sessionId);
        if (!session) {
          callback({ error: 'Session not found' });
          return;
        }

        // Get AI provider from voice service
        const messages: any[] = [];

        if (options.userMessage) {
          messages.push({
            role: 'user',
            content: options.userMessage
          });
        }

        // Call AI provider's chat method
        const response = await (this.voiceService as any).aiProvider.chat(messages, {
          systemPrompt: options.systemPrompt,
          temperature: options.temperature || 0.7,
          maxTokens: options.maxTokens || 150
        });

        console.log(`[WebSocket] AI response (${sessionId}):`, response.substring(0, 50));

        callback({
          success: true,
          response: response
        });
      } catch (error) {
        console.error('[WebSocket] Error processing chat message:', error);
        callback({ error: error instanceof Error ? error.message : 'Unknown error' });
      }
    });

    // Client requests to extract information from text
    socket.on('extract.info', async (options: any, callback) => {
      try {
        console.log(`[WebSocket] Extract info from: ${options.text?.substring(0, 50)} (${sessionId})`);

        const extracted = await this.voiceService.extractCustomerInfo(options.text || '');

        console.log(`[WebSocket] Extracted info:`, extracted);

        callback(extracted);
      } catch (error) {
        console.error('[WebSocket] Error extracting info:', error);
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
