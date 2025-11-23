import { EventEmitter } from 'events';
import { logger } from '../utils/logger';
import { SIPServerService } from './SIPServerService';
import { AudioMixer } from './AudioMixer';

/**
 * B2BUA (Back-to-Back User Agent) Manager
 * Manages two SIP dialogs (Leg A and Leg B) and bridges audio between them
 *
 * Flow:
 * 1. Customer calls in (Leg A) - handled by SIP server
 * 2. B2BUA initiates outbound call to destination (Leg B)
 * 3. Audio is mixed between both legs
 * 4. Transcription service can listen to mixed audio
 */

interface B2BUASession {
  sessionId: string;
  legACallId: string;  // Inbound call
  legBCallId: string | null;  // Outbound call
  mixer: AudioMixer;
  state: 'connecting' | 'established' | 'terminating' | 'terminated';
  createdAt: Date;
}

export interface B2BUAOptions {
  /**
   * Destination SIP URI to call (Leg B)
   * Example: 'sip:pjschroeder@204671.tenios.com'
   */
  destinationUri: string;

  /**
   * Whether to enable transcription on this session
   */
  enableTranscription?: boolean;

  /**
   * Display name for the bridged call
   */
  displayName?: string;
}

export class B2BUAManager extends EventEmitter {
  private sipServer: SIPServerService;
  private sessions: Map<string, B2BUASession> = new Map();

  constructor(sipServer: SIPServerService) {
    super();
    this.sipServer = sipServer;

    // Listen to SIP server events
    this.setupSIPServerListeners();
  }

  private setupSIPServerListeners(): void {
    // When inbound call starts, we might automatically bridge it
    this.sipServer.on('callStarted', async ({ callId, rtpHandler }) => {
      logger.debug({ callId }, 'B2BUA: Inbound call started');
      // Note: We don't auto-bridge here. Bridge must be explicitly initiated.
    });

    this.sipServer.on('callEnded', ({ callId }) => {
      // Find session by Leg A or Leg B call ID
      const session = this.findSessionByCallId(callId);
      if (session) {
        logger.info({ sessionId: session.sessionId, callId }, 'B2BUA: Call leg ended, terminating session');
        this.terminateSession(session.sessionId);
      }
    });

    this.sipServer.on('callFailed', ({ callId, statusCode, statusText }) => {
      const session = this.findSessionByCallId(callId);
      if (session) {
        logger.error({ sessionId: session.sessionId, callId, statusCode, statusText }, 'B2BUA: Call leg failed');
        this.terminateSession(session.sessionId);
      }
    });
  }

  /**
   * Create a new B2BUA session by bridging an inbound call to a destination
   */
  async createSession(inboundCallId: string, options: B2BUAOptions): Promise<string> {
    const sessionId = `b2bua-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

    logger.info({
      sessionId,
      inboundCallId,
      destination: options.destinationUri
    }, 'Creating B2BUA session');

    // Verify inbound call exists
    const legARTPHandler = this.sipServer.getRTPHandler(inboundCallId);
    if (!legARTPHandler) {
      throw new Error(`Inbound call ${inboundCallId} not found`);
    }

    // Create audio mixer for this session
    const mixer = new AudioMixer(sessionId);

    // Add Leg A to mixer
    mixer.addLeg('legA', legARTPHandler);
    logger.debug({ sessionId }, 'Leg A added to mixer');

    // Create session in connecting state
    const session: B2BUASession = {
      sessionId,
      legACallId: inboundCallId,
      legBCallId: null,
      mixer,
      state: 'connecting',
      createdAt: new Date()
    };
    this.sessions.set(sessionId, session);

    try {
      // Initiate outbound call (Leg B)
      const legBCallId = await this.sipServer.initiateOutboundCall({
        toUri: options.destinationUri,
        fromDisplayName: options.displayName
      });

      session.legBCallId = legBCallId;
      logger.info({ sessionId, legBCallId }, 'Leg B call initiated');

      // Wait for Leg B to be established
      await this.waitForCallEstablished(legBCallId);

      // Get Leg B RTP handler
      const legBRTPHandler = this.sipServer.getRTPHandler(legBCallId);
      if (!legBRTPHandler) {
        throw new Error(`Leg B RTP handler not found for call ${legBCallId}`);
      }

      // Add Leg B to mixer
      mixer.addLeg('legB', legBRTPHandler);
      logger.debug({ sessionId }, 'Leg B added to mixer');

      // Session is now established
      session.state = 'established';
      logger.info({ sessionId }, 'B2BUA session established');

      // If transcription is enabled, emit mixed audio events
      if (options.enableTranscription) {
        mixer.on('mixedAudio', (audioData) => {
          this.emit('transcriptionAudio', { sessionId, audioData });
        });

        // Also emit separate leg audio for speaker diarization
        mixer.on('legAAudio', (audioData) => {
          this.emit('legAAudio', { sessionId, speaker: 'customer', audioData });
        });

        mixer.on('legBAudio', (audioData) => {
          this.emit('legBAudio', { sessionId, speaker: 'agent', audioData });
        });
      }

      this.emit('sessionEstablished', { sessionId });
      return sessionId;

    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to create B2BUA session');
      await this.terminateSession(sessionId);
      throw error;
    }
  }

  /**
   * Wait for an outbound call to be established
   */
  private waitForCallEstablished(callId: string, timeoutMs: number = 30000): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        cleanup();
        reject(new Error(`Call ${callId} did not establish within ${timeoutMs}ms`));
      }, timeoutMs);

      const onCallStarted = ({ callId: startedCallId }: { callId: string }) => {
        if (startedCallId === callId) {
          cleanup();
          resolve();
        }
      };

      const onCallFailed = ({ callId: failedCallId, statusCode, statusText }: any) => {
        if (failedCallId === callId) {
          cleanup();
          reject(new Error(`Call failed: ${statusCode} ${statusText}`));
        }
      };

      const cleanup = () => {
        clearTimeout(timeout);
        this.sipServer.off('callStarted', onCallStarted);
        this.sipServer.off('callFailed', onCallFailed);
      };

      this.sipServer.on('callStarted', onCallStarted);
      this.sipServer.on('callFailed', onCallFailed);
    });
  }

  /**
   * Terminate a B2BUA session and hang up both legs
   */
  async terminateSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      logger.warn({ sessionId }, 'Session not found for termination');
      return;
    }

    if (session.state === 'terminated' || session.state === 'terminating') {
      logger.debug({ sessionId }, 'Session already terminating/terminated');
      return;
    }

    session.state = 'terminating';
    logger.info({ sessionId }, 'Terminating B2BUA session');

    try {
      // Stop mixer first
      session.mixer.stop();

      // Hang up both legs
      if (session.legACallId) {
        try {
          await this.sipServer.terminateCall(session.legACallId);
        } catch (error) {
          logger.error({ error, callId: session.legACallId }, 'Error terminating Leg A');
        }
      }

      if (session.legBCallId) {
        try {
          await this.sipServer.terminateCall(session.legBCallId);
        } catch (error) {
          logger.error({ error, callId: session.legBCallId }, 'Error terminating Leg B');
        }
      }

      session.state = 'terminated';
      this.sessions.delete(sessionId);

      this.emit('sessionTerminated', { sessionId });
      logger.info({ sessionId }, 'B2BUA session terminated');

    } catch (error) {
      logger.error({ error, sessionId }, 'Error during session termination');
      session.state = 'terminated';
      this.sessions.delete(sessionId);
    }
  }

  /**
   * Find session by either Leg A or Leg B call ID
   */
  private findSessionByCallId(callId: string): B2BUASession | undefined {
    for (const session of this.sessions.values()) {
      if (session.legACallId === callId || session.legBCallId === callId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Get session info
   */
  getSession(sessionId: string): B2BUASession | undefined {
    return this.sessions.get(sessionId);
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): B2BUASession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.state === 'established' || s.state === 'connecting'
    );
  }

  /**
   * Get session by inbound call ID
   */
  getSessionByInboundCallId(callId: string): B2BUASession | undefined {
    for (const session of this.sessions.values()) {
      if (session.legACallId === callId) {
        return session;
      }
    }
    return undefined;
  }

  /**
   * Clean up all sessions
   */
  async cleanup(): Promise<void> {
    logger.info('Cleaning up all B2BUA sessions');
    const sessionIds = Array.from(this.sessions.keys());
    await Promise.all(sessionIds.map(id => this.terminateSession(id)));
  }
}
