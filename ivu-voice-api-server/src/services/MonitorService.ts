import { EventEmitter } from 'events';
import { env } from '../config/env';
import { SIPServerService, RTPAudioHandler, PassiveListenerPipeline } from '../sip';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { createProviderRegistry, initializeAsyncProviders } from '../providers/ProviderFactory';

export interface MonitorSessionOptions {
  sttProvider?: string;
  language?: string;
  agentId?: string; // Optional agent identifier for mapping
  metadata?: Record<string, string>; // Custom metadata
  denoiserProvider?: string; // 'rnnoise', 'none', or omit for default
}

interface MonitorSession {
  callId: string;
  pipeline: PassiveListenerPipeline;
  rtpHandler: RTPAudioHandler;
  startedAt: Date;
  options: MonitorSessionOptions;
  transcripts: TranscriptEntry[];
}

interface TranscriptEntry {
  text: string;
  timestamp: Date;
  durationMs?: number;
}

/**
 * Monitor Service
 *
 * Manages passive monitoring sessions for live call transcription.
 * Agents can add "our number" to their customer calls, and we provide
 * live transcription without speaking.
 *
 * Use Case:
 * 1. Agent is on call with customer
 * 2. Agent adds our monitor number as 3rd participant
 * 3. We answer, stay silent, transcribe everything
 * 4. Agent sees live transcript in web UI
 */
export class MonitorService extends EventEmitter {
  private sipServer: SIPServerService | null = null;
  private registry: ProviderRegistry;
  private activeSessions: Map<string, MonitorSession> = new Map();
  private defaultOptions: MonitorSessionOptions;

  constructor() {
    super();
    this.registry = createProviderRegistry();
    this.defaultOptions = {
      sttProvider: env.DEFAULT_STT_PROVIDER,
      language: 'de',
      denoiserProvider: env.DEFAULT_DENOISER_PROVIDER
    };
  }

  /**
   * Start the monitor service
   */
  async start(): Promise<void> {
    if (!env.SIP_ENABLED) {
      console.log('[MonitorService] SIP is disabled, skipping initialization');
      return;
    }

    console.log('[MonitorService] Starting monitor service...');

    // Initialize async providers (denoiser WASM modules)
    await initializeAsyncProviders(this.registry);

    // Create SIP server
    this.sipServer = new SIPServerService(
      env.SIP_PORT,
      env.SIP_USERNAME || 'monitor',
      env.SIP_DOMAIN,
      env.SIP_PASSWORD || '',
      env.SIP_PUBLIC_IP,
      env.SIP_SKIP_REGISTRATION
    );

    // Handle incoming calls - these are monitoring requests
    this.sipServer.on('callStarted', async ({ callId, rtpHandler }) => {
      console.log(`[MonitorService] Incoming monitor request: ${callId}`);
      await this.handleIncomingCall(callId, rtpHandler);
    });

    // Handle call endings
    this.sipServer.on('callEnded', ({ callId }) => {
      console.log(`[MonitorService] Monitor session ended: ${callId}`);
      this.handleCallEnded(callId);
    });

    // Start listening
    await this.sipServer.start();
    console.log('[MonitorService] Monitor service started - ready for incoming calls');
  }

  /**
   * Handle an incoming monitoring call
   */
  private async handleIncomingCall(
    callId: string,
    rtpHandler: RTPAudioHandler,
    options?: MonitorSessionOptions
  ): Promise<void> {
    const sessionOptions = { ...this.defaultOptions, ...options };

    // Create passive listener pipeline
    const pipeline = new PassiveListenerPipeline(callId, rtpHandler, this.registry, {
      sttProvider: sessionOptions.sttProvider,
      language: sessionOptions.language,
      sendComfortNoise: true,
      denoiserProvider: sessionOptions.denoiserProvider
    });

    // Store session with transcript history
    const session: MonitorSession = {
      callId,
      pipeline,
      rtpHandler,
      startedAt: new Date(),
      options: sessionOptions,
      transcripts: []
    };
    this.activeSessions.set(callId, session);

    // Forward pipeline events
    pipeline.on('transcription', (data) => {
      // Store transcript
      session.transcripts.push({
        text: data.text,
        timestamp: data.timestamp,
        durationMs: data.durationMs
      });

      // Emit for WebSocket broadcast
      this.emit('transcription', {
        ...data,
        agentId: sessionOptions.agentId,
        metadata: sessionOptions.metadata
      });
    });

    pipeline.on('started', () => {
      this.emit('sessionStarted', {
        callId,
        agentId: sessionOptions.agentId,
        startedAt: session.startedAt,
        options: sessionOptions
      });
    });

    pipeline.on('stopped', (data) => {
      this.emit('sessionEnded', {
        ...data,
        agentId: sessionOptions.agentId,
        transcriptCount: session.transcripts.length
      });
    });

    pipeline.on('error', (data) => {
      this.emit('error', {
        ...data,
        agentId: sessionOptions.agentId
      });
    });

    // Start monitoring
    try {
      await pipeline.start();
      console.log(`[MonitorService] Monitoring active for ${callId}`);
    } catch (error) {
      console.error(`[MonitorService] Failed to start monitoring for ${callId}:`, error);
      this.activeSessions.delete(callId);
    }
  }

  /**
   * Handle call ended
   */
  private handleCallEnded(callId: string): void {
    const session = this.activeSessions.get(callId);
    if (session) {
      session.pipeline.stop();
      this.activeSessions.delete(callId);
    }
  }

  /**
   * Get active monitoring sessions
   */
  getActiveSessions(): {
    callId: string;
    agentId?: string;
    startedAt: Date;
    durationMs: number;
    transcriptCount: number;
  }[] {
    return Array.from(this.activeSessions.values()).map((session) => ({
      callId: session.callId,
      agentId: session.options.agentId,
      startedAt: session.startedAt,
      durationMs: Date.now() - session.startedAt.getTime(),
      transcriptCount: session.transcripts.length
    }));
  }

  /**
   * Get transcripts for a specific session
   */
  getSessionTranscripts(callId: string): TranscriptEntry[] | null {
    const session = this.activeSessions.get(callId);
    return session ? [...session.transcripts] : null;
  }

  /**
   * Get full transcript as text
   */
  getSessionTranscriptText(callId: string): string | null {
    const session = this.activeSessions.get(callId);
    if (!session) return null;

    return session.transcripts.map((t) => t.text).join(' ');
  }

  /**
   * Terminate a specific monitoring session
   */
  async terminateSession(callId: string): Promise<boolean> {
    const session = this.activeSessions.get(callId);
    if (!session) {
      console.warn(`[MonitorService] Cannot terminate unknown session: ${callId}`);
      return false;
    }

    console.log(`[MonitorService] Terminating session: ${callId}`);
    await session.pipeline.stop();

    if (this.sipServer) {
      await this.sipServer.terminateCall(callId);
    }

    this.activeSessions.delete(callId);
    return true;
  }

  /**
   * Update default options
   */
  setDefaultOptions(options: MonitorSessionOptions): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
    console.log('[MonitorService] Default options updated:', this.defaultOptions);
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): { stt: string[]; tts: string[]; llm: string[]; denoiser: string[] } {
    return this.registry.getSummary();
  }

  /**
   * Get current default options
   */
  getDefaultOptions(): MonitorSessionOptions {
    return { ...this.defaultOptions };
  }

  /**
   * Stop the monitor service
   */
  async stop(): Promise<void> {
    console.log('[MonitorService] Stopping...');

    // Stop all active sessions
    for (const session of this.activeSessions.values()) {
      await session.pipeline.stop();
    }
    this.activeSessions.clear();

    // Stop SIP server
    if (this.sipServer) {
      await this.sipServer.stop();
      this.sipServer = null;
    }

    console.log('[MonitorService] Stopped');
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.sipServer !== null;
  }
}

// Singleton instance
let monitorService: MonitorService | null = null;

/**
 * Get the singleton monitor service instance
 */
export function getMonitorService(): MonitorService {
  if (!monitorService) {
    monitorService = new MonitorService();
  }
  return monitorService;
}
