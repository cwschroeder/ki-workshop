/**
 * B2BUA 3-Party Conference Example
 *
 * This example demonstrates how to set up a 3-party conference call:
 * 1. Customer calls in (simulated via cmschroeder SIP account)
 * 2. System bridges to Stadtwerk hotline (pjschroeder SIP account)
 * 3. Transcription service listens and records the conversation
 *
 * Setup:
 * - SIP Account 1 (cmschroeder): Customer simulator
 * - SIP Account 2 (pjschroeder): Stadtwerk hotline simulator
 * - SIP Server: Acts as B2BUA and transcription listener
 *
 * Usage:
 *   npm run example:b2bua
 */

import { SIPServerService } from '../services/SIPServerService';
import { B2BUAManager } from '../services/B2BUAManager';
import { VoiceAgentPipeline } from '../services/VoiceAgentPipeline';
import { OpenAISTTProvider } from '../providers/openai/OpenAISTTProvider';
import { OpenAILLMProvider } from '../providers/openai/OpenAILLMProvider';
import { OpenAITTSProvider } from '../providers/openai/OpenAITTSProvider';
import { CsvService } from '../services/CsvService';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Main B2BUA Conference Manager
 * Orchestrates the 3-party conference with transcription
 */
class B2BUAConferenceManager {
  private sipServer: SIPServerService;
  private b2buaManager: B2BUAManager;
  private csvService: CsvService;
  private sttProvider: OpenAISTTProvider;
  private llmProvider: OpenAILLMProvider;
  private ttsProvider: OpenAITTSProvider;
  private transcriptionPipelines: Map<string, VoiceAgentPipeline> = new Map();

  constructor() {
    // Initialize SIP server (will handle both inbound calls and outbound bridging)
    this.sipServer = new SIPServerService(
      5060,
      'cwschroeder', // Our main SIP account
      '204671.tenios.com',
      'passwort123456',
      env.PUBLIC_IP
    );

    // Initialize B2BUA manager
    this.b2buaManager = new B2BUAManager(this.sipServer);

    // Initialize CSV service for transcription storage
    this.csvService = new CsvService();

    // Initialize AI providers for transcription
    this.sttProvider = new OpenAISTTProvider(env.OPENAI_API_KEY);
    this.llmProvider = new OpenAILLMProvider(env.OPENAI_API_KEY, 'gpt-4o-mini');
    this.ttsProvider = new OpenAITTSProvider(env.OPENAI_API_KEY, 'tts-1', 'nova');
  }

  async start(): Promise<void> {
    logger.info('🚀 Starting B2BUA Conference Manager');

    // Listen for incoming calls
    this.sipServer.on('callStarted', async ({ callId, rtpHandler }) => {
      logger.info({ callId }, '📞 Incoming call detected');

      // Create B2BUA session: Bridge to Stadtwerk hotline
      const sessionId = await this.b2buaManager.createSession(callId, {
        destinationUri: 'sip:pjschroeder@204671.tenios.com',
        displayName: 'Customer Call',
        enableTranscription: true
      });

      logger.info({ sessionId, callId }, '🔗 B2BUA session established');
    });

    // Listen for B2BUA session establishment
    this.b2buaManager.on('sessionEstablished', ({ sessionId }) => {
      logger.info({ sessionId }, '✅ Conference active, starting transcription');
      this.startTranscription(sessionId);
    });

    // Listen for individual leg audio (for speaker diarization)
    this.b2buaManager.on('legAAudio', ({ sessionId, speaker, audioData }) => {
      // This is customer audio (Leg A)
      // We can process it separately if needed
    });

    this.b2buaManager.on('legBAudio', ({ sessionId, speaker, audioData }) => {
      // This is agent audio (Leg B)
      // We can process it separately if needed
    });

    // Listen for mixed transcription audio
    this.b2buaManager.on('transcriptionAudio', ({ sessionId, audioData }) => {
      // This is the mixed audio for transcription
      // Currently handled by individual leg pipelines
    });

    // Listen for session termination
    this.b2buaManager.on('sessionTerminated', ({ sessionId }) => {
      logger.info({ sessionId }, '🔚 Conference ended');
      this.stopTranscription(sessionId);
    });

    // Start SIP server
    await this.sipServer.start();

    logger.info('✅ B2BUA Conference Manager ready');
    logger.info('📋 Configuration:');
    logger.info(`   - Inbound calls will be bridged to: pjschroeder@204671.tenios.com`);
    logger.info(`   - Transcription: ENABLED`);
    logger.info(`   - CSV Storage: ${env.TRANSCRIPTIONS_CSV_PATH}`);
  }

  /**
   * Start transcription for a B2BUA session
   * Creates separate transcription pipelines for each leg (customer and agent)
   */
  private startTranscription(sessionId: string): void {
    const session = this.b2buaManager.getSession(sessionId);
    if (!session) {
      logger.error({ sessionId }, 'Session not found for transcription');
      return;
    }

    // Create transcription pipeline for Leg A (Customer)
    const legARTPHandler = this.sipServer.getRTPHandler(session.legACallId);
    if (legARTPHandler) {
      const legAPipeline = new VoiceAgentPipeline(
        `${sessionId}-legA`,
        legARTPHandler,
        this.sttProvider,
        this.llmProvider,
        this.ttsProvider,
        { listenOnlyMode: true, speakerLabel: 'customer' }
      );

      // Listen for transcriptions from customer
      legAPipeline.on('transcription', async (data) => {
        logger.info({
          sessionId,
          speaker: data.speaker,
          text: data.text
        }, '💬 Customer said');

        // Save to CSV
        await this.csvService.saveTranscription({
          call_id: sessionId,
          timestamp: data.timestamp.toISOString(),
          speaker: data.speaker,
          text: data.text,
          confidence: 0.95 // Placeholder, OpenAI Whisper doesn't provide confidence
        });
      });

      legAPipeline.start();
      this.transcriptionPipelines.set(`${sessionId}-legA`, legAPipeline);
      logger.debug({ sessionId }, 'Leg A transcription pipeline started');
    }

    // Create transcription pipeline for Leg B (Agent)
    if (session.legBCallId) {
      const legBRTPHandler = this.sipServer.getRTPHandler(session.legBCallId);
      if (legBRTPHandler) {
        const legBPipeline = new VoiceAgentPipeline(
          `${sessionId}-legB`,
          legBRTPHandler,
          this.sttProvider,
          this.llmProvider,
          this.ttsProvider,
          { listenOnlyMode: true, speakerLabel: 'agent' }
        );

        // Listen for transcriptions from agent
        legBPipeline.on('transcription', async (data) => {
          logger.info({
            sessionId,
            speaker: data.speaker,
            text: data.text
          }, '💬 Agent said');

          // Save to CSV
          await this.csvService.saveTranscription({
            call_id: sessionId,
            timestamp: data.timestamp.toISOString(),
            speaker: data.speaker,
            text: data.text,
            confidence: 0.95
          });
        });

        legBPipeline.start();
        this.transcriptionPipelines.set(`${sessionId}-legB`, legBPipeline);
        logger.debug({ sessionId }, 'Leg B transcription pipeline started');
      }
    }
  }

  /**
   * Stop transcription for a session
   */
  private async stopTranscription(sessionId: string): Promise<void> {
    const legAPipeline = this.transcriptionPipelines.get(`${sessionId}-legA`);
    if (legAPipeline) {
      await legAPipeline.stop();
      this.transcriptionPipelines.delete(`${sessionId}-legA`);
    }

    const legBPipeline = this.transcriptionPipelines.get(`${sessionId}-legB`);
    if (legBPipeline) {
      await legBPipeline.stop();
      this.transcriptionPipelines.delete(`${sessionId}-legB`);
    }

    logger.info({ sessionId }, 'Transcription stopped');
  }

  async stop(): Promise<void> {
    logger.info('🛑 Stopping B2BUA Conference Manager');

    // Stop all transcription pipelines
    for (const [id, pipeline] of this.transcriptionPipelines) {
      await pipeline.stop();
    }
    this.transcriptionPipelines.clear();

    // Cleanup B2BUA sessions
    await this.b2buaManager.cleanup();

    // Stop SIP server
    await this.sipServer.stop();

    logger.info('✅ B2BUA Conference Manager stopped');
  }
}

// Main execution
async function main() {
  const manager = new B2BUAConferenceManager();

  // Handle graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('Received SIGINT, shutting down gracefully...');
    await manager.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('Received SIGTERM, shutting down gracefully...');
    await manager.stop();
    process.exit(0);
  });

  try {
    await manager.start();

    // Keep process alive
    logger.info('Press Ctrl+C to stop');
  } catch (error) {
    logger.error({ error }, 'Fatal error');
    await manager.stop();
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  main().catch((error) => {
    logger.error({ error }, 'Unhandled error in main');
    process.exit(1);
  });
}

export { B2BUAConferenceManager };
