import { EventEmitter } from 'events';
import { env } from '../config/env';
import { SIPServerService, VoiceAgentPipeline, RTPAudioHandler } from '../sip';
import { ProviderRegistry } from '../providers/ProviderRegistry';
import { createProviderRegistry } from '../providers/ProviderFactory';

export interface SIPCallOptions {
  systemPrompt?: string;
  sttProvider?: string;
  llmProvider?: string;
  ttsProvider?: string;
}

interface ActiveCall {
  callId: string;
  pipeline: VoiceAgentPipeline;
  rtpHandler: RTPAudioHandler;
  startedAt: Date;
  options: SIPCallOptions;
}

/**
 * SIP Voice Service
 *
 * Manages SIP calls and voice agent pipelines.
 * Integrates with ProviderRegistry for runtime provider selection.
 */
export class SIPVoiceService extends EventEmitter {
  private sipServer: SIPServerService | null = null;
  private registry: ProviderRegistry;
  private activeCalls: Map<string, ActiveCall> = new Map();
  private defaultOptions: SIPCallOptions;

  constructor() {
    super();
    this.registry = createProviderRegistry();
    this.defaultOptions = {
      sttProvider: env.DEFAULT_STT_PROVIDER,
      llmProvider: env.DEFAULT_LLM_PROVIDER,
      ttsProvider: env.DEFAULT_TTS_PROVIDER
    };
  }

  /**
   * Start the SIP voice service
   */
  async start(): Promise<void> {
    if (!env.SIP_ENABLED) {
      console.log('[SIPVoiceService] SIP is disabled, skipping initialization');
      return;
    }

    console.log('[SIPVoiceService] Starting SIP voice service...');

    // Create SIP server
    this.sipServer = new SIPServerService(
      env.SIP_PORT,
      env.SIP_USERNAME || 'voicebot',
      env.SIP_DOMAIN,
      env.SIP_PASSWORD || '',
      env.SIP_PUBLIC_IP,
      env.SIP_SKIP_REGISTRATION
    );

    // Handle incoming calls
    this.sipServer.on('callStarted', async ({ callId, rtpHandler }) => {
      console.log(`[SIPVoiceService] Incoming call: ${callId}`);
      await this.handleIncomingCall(callId, rtpHandler);
    });

    // Handle call endings
    this.sipServer.on('callEnded', ({ callId }) => {
      console.log(`[SIPVoiceService] Call ended: ${callId}`);
      this.handleCallEnded(callId);
    });

    // Handle call failures
    this.sipServer.on('callFailed', ({ callId, statusCode, statusText }) => {
      console.error(`[SIPVoiceService] Call failed: ${callId} - ${statusCode} ${statusText}`);
      this.handleCallEnded(callId);
    });

    // Start listening
    await this.sipServer.start();
    console.log('[SIPVoiceService] SIP voice service started');
  }

  /**
   * Handle an incoming SIP call
   */
  private async handleIncomingCall(
    callId: string,
    rtpHandler: RTPAudioHandler,
    options?: SIPCallOptions
  ): Promise<void> {
    const callOptions = { ...this.defaultOptions, ...options };

    // Create voice agent pipeline
    const pipeline = new VoiceAgentPipeline(callId, rtpHandler, this.registry, {
      systemPrompt: callOptions.systemPrompt,
      sttProvider: callOptions.sttProvider,
      llmProvider: callOptions.llmProvider,
      ttsProvider: callOptions.ttsProvider
    });

    // Forward pipeline events
    pipeline.on('transcription', (data) => {
      this.emit('transcription', data);
    });

    pipeline.on('agentResponse', (data) => {
      this.emit('agentResponse', data);
    });

    // Store active call
    this.activeCalls.set(callId, {
      callId,
      pipeline,
      rtpHandler,
      startedAt: new Date(),
      options: callOptions
    });

    // Start the pipeline
    try {
      await pipeline.start();
      this.emit('callStarted', { callId, options: callOptions });
    } catch (error) {
      console.error(`[SIPVoiceService] Failed to start pipeline for ${callId}:`, error);
      await this.terminateCall(callId);
    }
  }

  /**
   * Handle call ended
   */
  private handleCallEnded(callId: string): void {
    const call = this.activeCalls.get(callId);
    if (call) {
      call.pipeline.stop();
      this.activeCalls.delete(callId);
      this.emit('callEnded', { callId, duration: Date.now() - call.startedAt.getTime() });
    }
  }

  /**
   * Configure options for new calls
   */
  setDefaultOptions(options: SIPCallOptions): void {
    this.defaultOptions = { ...this.defaultOptions, ...options };
    console.log('[SIPVoiceService] Default options updated:', this.defaultOptions);
  }

  /**
   * Get active calls
   */
  getActiveCalls(): { callId: string; startedAt: Date; options: SIPCallOptions }[] {
    return Array.from(this.activeCalls.values()).map((call) => ({
      callId: call.callId,
      startedAt: call.startedAt,
      options: call.options
    }));
  }

  /**
   * Terminate a specific call
   */
  async terminateCall(callId: string): Promise<boolean> {
    const call = this.activeCalls.get(callId);
    if (!call) {
      console.warn(`[SIPVoiceService] Cannot terminate unknown call: ${callId}`);
      return false;
    }

    console.log(`[SIPVoiceService] Terminating call: ${callId}`);
    await call.pipeline.stop();

    if (this.sipServer) {
      await this.sipServer.terminateCall(callId);
    }

    this.activeCalls.delete(callId);
    this.emit('callEnded', { callId, duration: Date.now() - call.startedAt.getTime() });
    return true;
  }

  /**
   * Get available providers
   */
  getAvailableProviders(): { stt: string[]; tts: string[]; llm: string[] } {
    return this.registry.getSummary();
  }

  /**
   * Stop the SIP voice service
   */
  async stop(): Promise<void> {
    console.log('[SIPVoiceService] Stopping...');

    // Stop all active calls
    for (const call of this.activeCalls.values()) {
      await call.pipeline.stop();
    }
    this.activeCalls.clear();

    // Stop SIP server
    if (this.sipServer) {
      await this.sipServer.stop();
      this.sipServer = null;
    }

    console.log('[SIPVoiceService] Stopped');
  }

  /**
   * Check if service is running
   */
  isRunning(): boolean {
    return this.sipServer !== null;
  }
}

// Singleton instance
let sipVoiceService: SIPVoiceService | null = null;

/**
 * Get the singleton SIP voice service instance
 */
export function getSIPVoiceService(): SIPVoiceService {
  if (!sipVoiceService) {
    sipVoiceService = new SIPVoiceService();
  }
  return sipVoiceService;
}
