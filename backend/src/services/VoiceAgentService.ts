import { SIPServerService } from './SIPServerService';
import { VoiceAgentPipeline } from './VoiceAgentPipeline';
import { OpenAISTTProvider } from '../providers/openai/OpenAISTTProvider';
import { OpenAILLMProvider } from '../providers/openai/OpenAILLMProvider';
import { OpenAITTSProvider } from '../providers/openai/OpenAITTSProvider';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Voice Agent Service
 * Manages SIP server and voice agent pipelines for incoming calls
 */
export class VoiceAgentService {
  private sipServer: SIPServerService;
  private activePipelines: Map<string, VoiceAgentPipeline> = new Map();

  // Providers (can be swapped for open-source alternatives)
  private sttProvider: OpenAISTTProvider;
  private llmProvider: OpenAILLMProvider;
  private ttsProvider: OpenAITTSProvider;

  constructor() {
    // Initialize SIP server
    this.sipServer = new SIPServerService(
      5060,
      'cwschroeder',
      '204671.tenios.com',
      'passwort123456',
      env.PUBLIC_IP
    );

    // Initialize AI providers (OpenAI for now, easily swappable)
    this.sttProvider = new OpenAISTTProvider(env.OPENAI_API_KEY);
    this.llmProvider = new OpenAILLMProvider(env.OPENAI_API_KEY, 'gpt-4o-mini');
    this.ttsProvider = new OpenAITTSProvider(env.OPENAI_API_KEY, 'tts-1', 'nova');

    logger.info({
      stt: this.sttProvider.getName(),
      llm: this.llmProvider.getName(),
      tts: this.ttsProvider.getName()
    }, 'Voice Agent providers initialized');
  }

  /**
   * Start the voice agent service
   */
  async start(): Promise<void> {
    logger.info('Starting Voice Agent Service');

    // Handle incoming calls
    this.sipServer.on('callStarted', async ({ callId, rtpHandler }) => {
      logger.info({ callId }, 'New call started, creating voice pipeline');

      // Create voice agent pipeline for this call
      const pipeline = new VoiceAgentPipeline(
        callId,
        rtpHandler,
        this.sttProvider,
        this.llmProvider,
        this.ttsProvider
      );

      this.activePipelines.set(callId, pipeline);

      // Start the pipeline
      await pipeline.start();
    });

    // Handle call termination
    this.sipServer.on('callEnded', async ({ callId }) => {
      logger.info({ callId }, 'Call ended, stopping pipeline');

      const pipeline = this.activePipelines.get(callId);
      if (pipeline) {
        await pipeline.stop();
        this.activePipelines.delete(callId);
      }
    });

    // Start SIP server
    await this.sipServer.start();

    logger.info('Voice Agent Service started successfully');
  }

  /**
   * Stop the voice agent service
   */
  async stop(): Promise<void> {
    logger.info('Stopping Voice Agent Service');

    // Stop all active pipelines
    for (const [callId, pipeline] of this.activePipelines) {
      await pipeline.stop();
      this.activePipelines.delete(callId);
    }

    // Stop SIP server
    await this.sipServer.stop();

    logger.info('Voice Agent Service stopped');
  }
}

// Singleton instance
export const voiceAgentService = new VoiceAgentService();
