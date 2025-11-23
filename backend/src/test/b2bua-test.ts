/**
 * B2BUA Integration Test
 *
 * Testet die 3-Parteien-Konferenz mit simulierten SIP-Agents
 *
 * Setup:
 * 1. B2BUA Server (cwschroeder) - Empfängt Calls und bridged
 * 2. Agent Simulator (pjschroeder) - Simulierte Stadtwerk-Hotline
 * 3. Customer Simulator (lkschroeder) - Simulierter Kunde, ruft an
 */

import { SIPServerService } from '../services/SIPServerService';
import { B2BUAManager } from '../services/B2BUAManager';
import { VoiceAgentPipeline } from '../services/VoiceAgentPipeline';
import { OpenAISTTProvider } from '../providers/openai/OpenAISTTProvider';
import { OpenAILLMProvider } from '../providers/openai/OpenAILLMProvider';
import { OpenAITTSProvider } from '../providers/openai/OpenAITTSProvider';
import { TranscriptVerifier } from './transcript-verifier';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Test Manager orchestriert alle drei Komponenten
 */
class B2BUATestManager {
  // B2BUA Server (cwschroeder)
  private b2buaServer: SIPServerService;
  private b2buaManager: B2BUAManager;

  // Agent Simulator (pjschroeder)
  private agentServer: SIPServerService;
  private agentPipeline: VoiceAgentPipeline | null = null;

  // Customer Simulator (lkschroeder)
  private customerServer: SIPServerService;
  private customerPipeline: VoiceAgentPipeline | null = null;

  // AI Providers
  private sttProvider: OpenAISTTProvider;
  private llmProvider: OpenAILLMProvider;
  private ttsProvider: OpenAITTSProvider;

  // Stats
  private transcriptCount = 0;
  private conferenceStartTime: number = 0;
  private customerHasSpoken = false;

  // Transcript Verification
  private transcriptVerifier: TranscriptVerifier | null = null;

  constructor() {
    logger.info('🧪 Initializing B2BUA Test Environment (Peer-to-Peer Mode)');

    // Initialize AI providers
    this.sttProvider = new OpenAISTTProvider(env.OPENAI_API_KEY);
    this.llmProvider = new OpenAILLMProvider(env.OPENAI_API_KEY, 'gpt-4o-mini');
    this.ttsProvider = new OpenAITTSProvider(env.OPENAI_API_KEY, 'tts-1', 'nova');

    // Peer-to-Peer Mode: All servers on localhost, no Tenios registration
    // Note: Each server uses different RTP port ranges to avoid conflicts
    // 1. B2BUA Server (port 5060, RTP 10000-12000)
    this.b2buaServer = new SIPServerService(
      5060,
      'b2bua',
      'localhost',
      '',
      undefined,
      true  // skipRegistration = true
    );
    (this.b2buaServer as any).rtpPortRange = { min: 10000, max: 12000 };
    (this.b2buaServer as any).nextRTPPort = 10000;

    this.b2buaManager = new B2BUAManager(this.b2buaServer);

    // 2. Agent Simulator (port 5061, RTP 12000-14000)
    this.agentServer = new SIPServerService(
      5061,
      'agent',
      'localhost',
      '',
      undefined,
      true  // skipRegistration = true
    );
    (this.agentServer as any).rtpPortRange = { min: 12000, max: 14000 };
    (this.agentServer as any).nextRTPPort = 12000;

    // 3. Customer Simulator (port 5062, RTP 14000-16000)
    this.customerServer = new SIPServerService(
      5062,
      'customer',
      'localhost',
      '',
      undefined,
      true  // skipRegistration = true
    );
    (this.customerServer as any).rtpPortRange = { min: 14000, max: 16000 };
    (this.customerServer as any).nextRTPPort = 14000;
  }

  async start(): Promise<void> {
    logger.info('🚀 Starting B2BUA Test Environment');

    // Start B2BUA Server
    await this.setupB2BUAServer();

    // Start Agent Simulator
    await this.setupAgentSimulator();

    // Start Customer Simulator
    await this.setupCustomerSimulator();

    logger.info('✅ Test Environment Ready');
    logger.info('');
    logger.info('📋 Test Setup (Peer-to-Peer):');
    logger.info('   1. B2BUA Server: localhost:5060');
    logger.info('   2. Agent Simulator: localhost:5061');
    logger.info('   3. Customer Simulator: localhost:5062');
    logger.info('');
    logger.info('🎬 Test Scenario:');
    logger.info('   - Customer calls B2BUA directly (no Tenios routing)');
    logger.info('   - B2BUA bridges to Agent');
    logger.info('   - Agent responds with voice agent pipeline');
    logger.info('   - Both sides will be transcribed separately');
    logger.info('');
    logger.info('⏰ Automated test will start in 5 seconds...');
    logger.info('');

    // Auto-start test after 5 seconds
    setTimeout(() => {
      this.initiateTestCall();
    }, 5000);
  }

  private async setupB2BUAServer(): Promise<void> {
    logger.info('🔧 Setting up B2BUA Server...');

    // Handle incoming calls -> automatically bridge to agent
    this.b2buaServer.on('callStarted', async ({ callId, rtpHandler }) => {
      // Only bridge inbound calls, not outbound calls we initiate
      const call = (this.b2buaServer as any).activeCalls.get(callId);
      if (!call || call.direction !== 'inbound') {
        return; // Skip outbound calls
      }

      // Check if session already exists for this call
      if (this.b2buaManager.getSessionByInboundCallId(callId)) {
        logger.debug({ callId }, 'Session already exists for this call, skipping');
        return;
      }

      logger.info({ callId }, '📞 INCOMING CALL to B2BUA');

      try {
        // Create B2BUA session (bridge to agent on localhost:5061)
        const sessionId = await this.b2buaManager.createSession(callId, {
          destinationUri: 'sip:agent@192.168.188.86:5061',
          displayName: 'Test Customer',
          enableTranscription: true
        });

        logger.info({ sessionId, callId }, '🔗 B2BUA SESSION CREATED');
        this.conferenceStartTime = Date.now();

      } catch (error) {
        logger.error({ error, callId }, '❌ Failed to create B2BUA session');
      }
    });

    // Handle B2BUA events
    this.b2buaManager.on('sessionEstablished', ({ sessionId }) => {
      const duration = Date.now() - this.conferenceStartTime;
      logger.info({ sessionId, setupDurationMs: duration }, '✅ CONFERENCE ESTABLISHED');

      // Initialize transcript verifier for this session
      this.transcriptVerifier = new TranscriptVerifier(sessionId);

      this.setupTranscription(sessionId);
    });

    this.b2buaManager.on('sessionTerminated', ({ sessionId }) => {
      const duration = Date.now() - this.conferenceStartTime;
      logger.info({
        sessionId,
        durationMs: duration,
        transcriptCount: this.transcriptCount
      }, '🔚 CONFERENCE ENDED');

      // Generate verification report
      if (this.transcriptVerifier) {
        this.generateVerificationReport();
      }

      // Reset counters
      this.transcriptCount = 0;
      this.conferenceStartTime = 0;
      this.customerHasSpoken = false;
      this.transcriptVerifier = null;
    });

    await this.b2buaServer.start();
    logger.info('✅ B2BUA Server started on port 5060');
  }

  private async setupAgentSimulator(): Promise<void> {
    logger.info('🔧 Setting up Agent Simulator (pjschroeder)...');

    // When agent receives a call, start voice pipeline
    this.agentServer.on('callStarted', async ({ callId, rtpHandler }) => {
      logger.info({ callId }, '📞 AGENT RECEIVED CALL');

      // Create interactive voice agent for the agent side
      this.agentPipeline = new VoiceAgentPipeline(
        callId,
        rtpHandler,
        this.sttProvider,
        this.llmProvider,
        this.ttsProvider,
        {
          listenOnlyMode: false, // Agent responds interactively
          speakerLabel: 'agent'
        }
      );

      // Listen for agent transcriptions (what agent hears)
      this.agentPipeline.on('transcription', (data) => {
        this.transcriptCount++;
        logger.info({
          speaker: data.speaker,
          text: data.text,
          count: this.transcriptCount,
          source: 'AGENT-HÖRT'
        }, '🎧 [AGENT HÖRT] 💬');

        // Record in transcript verifier
        if (this.transcriptVerifier) {
          this.transcriptVerifier.addTranscript({
            source: 'AGENT-HÖRT',
            speaker: data.speaker,
            text: data.text
          });
        }
      });

      // Listen for agent responses (what agent says)
      this.agentPipeline.on('agentResponse', (data) => {
        logger.info({
          speaker: data.speaker,
          text: data.text,
          source: 'AGENT-SAGT'
        }, '🗣️  [AGENT SAGT] 💬');

        // Record in transcript verifier
        if (this.transcriptVerifier) {
          this.transcriptVerifier.addTranscript({
            source: 'AGENT-SAGT',
            speaker: data.speaker,
            text: data.text
          });
        }
      });

      // Log when agent speaks
      rtpHandler.on('audio', (audioData) => {
        // This is audio the agent receives (customer via B2BUA)
        logger.debug({
          source: 'AGENT-EMPFÄNGT',
          bytes: audioData.length,
          direction: 'Customer → B2BUA → Agent'
        }, '📡 [AGENT EMPFÄNGT AUDIO]');
      });

      await this.agentPipeline.start();
      logger.info({ callId }, '🎤 Agent pipeline started');
    });

    this.agentServer.on('callEnded', async ({ callId }) => {
      logger.info({ callId }, '📴 AGENT CALL ENDED');
      if (this.agentPipeline) {
        await this.agentPipeline.stop();
        this.agentPipeline = null;
      }
    });

    await this.agentServer.start();
    logger.info('✅ Agent Simulator started on port 5061');
  }

  private setupTranscription(sessionId: string): void {
    const session = this.b2buaManager.getSession(sessionId);
    if (!session) return;

    logger.info({ sessionId }, '🎙️ Setting up transcription for both legs via mixer');

    // Get the mixer from the session
    const mixer = (session as any).mixer;
    if (!mixer) {
      logger.error({ sessionId }, 'Mixer not found in session');
      return;
    }

    // Audio buffers for each leg
    const legABuffer: Buffer[] = [];
    const legBBuffer: Buffer[] = [];
    const BUFFER_DURATION_MS = 1000; // Transcribe every 1 second
    const BYTES_PER_MS = 16; // 8kHz * 2 bytes = 16 bytes per ms

    // Listen to Leg A audio from mixer (customer audio only)
    mixer.on('legAAudio', async (audioData: Buffer) => {
      legABuffer.push(audioData);

      // Check if we have enough audio to transcribe
      const totalBytes = legABuffer.reduce((sum, buf) => sum + buf.length, 0);
      if (totalBytes >= BUFFER_DURATION_MS * BYTES_PER_MS) {
        const pcmData = Buffer.concat(legABuffer);
        legABuffer.length = 0; // Clear buffer

        try {
          // Transcribe PCM audio (provider will handle WAV conversion)
          const text = await this.sttProvider.transcribe(
            pcmData,  // Raw PCM data
            8000,     // Sample rate (G.711 is 8kHz)
            'de'      // German language
          );

          if (text && text.trim().length > 0) {
            this.transcriptCount++;
            logger.info({
              speaker: 'customer',
              text,
              count: this.transcriptCount,
              source: 'B2BUA-LEG-A'
            }, '🎧 [B2BUA HÖRT CUSTOMER] 💬');

            if (this.transcriptVerifier) {
              this.transcriptVerifier.addTranscript({
                source: 'B2BUA-LEG-A',
                speaker: 'customer',
                text
              });
            }
          }
        } catch (error) {
          logger.error({ error }, 'Failed to transcribe Leg A audio');
        }
      }
    });

    // Listen to Leg B audio from mixer (agent audio only)
    mixer.on('legBAudio', async (audioData: Buffer) => {
      legBBuffer.push(audioData);

      // Check if we have enough audio to transcribe
      const totalBytes = legBBuffer.reduce((sum, buf) => sum + buf.length, 0);
      if (totalBytes >= BUFFER_DURATION_MS * BYTES_PER_MS) {
        const pcmData = Buffer.concat(legBBuffer);
        legBBuffer.length = 0; // Clear buffer

        try {
          // Transcribe PCM audio (provider will handle WAV conversion)
          const text = await this.sttProvider.transcribe(
            pcmData,  // Raw PCM data
            8000,     // Sample rate (G.711 is 8kHz)
            'de'      // German language
          );

          if (text && text.trim().length > 0) {
            this.transcriptCount++;
            logger.info({
              speaker: 'agent',
              text,
              count: this.transcriptCount,
              source: 'B2BUA-LEG-B'
            }, '🎧 [B2BUA HÖRT AGENT] 💬');

            if (this.transcriptVerifier) {
              this.transcriptVerifier.addTranscript({
                source: 'B2BUA-LEG-B',
                speaker: 'agent',
                text
              });
            }
          }
        } catch (error) {
          logger.error({ error }, 'Failed to transcribe Leg B audio');
        }
      }
    });

    logger.info({ sessionId }, '✅ Mixer transcription listeners attached');
  }

  private async setupCustomerSimulator(): Promise<void> {
    logger.info('🔧 Setting up Customer Simulator (lkschroeder)...');

    // When customer's call is established, start voice pipeline
    this.customerServer.on('callStarted', async ({ callId, rtpHandler }) => {
      logger.info({ callId }, '📞 CUSTOMER CALL ESTABLISHED');

      // Create voice pipeline for customer
      this.customerPipeline = new VoiceAgentPipeline(
        callId,
        rtpHandler,
        this.sttProvider,
        this.llmProvider,
        this.ttsProvider,
        {
          listenOnlyMode: false, // Customer speaks interactively
          speakerLabel: 'customer',
          systemPrompt: `Du bist ein Kunde des Stadtwerks.
Du möchtest deinen Zählerstand melden.
Antworte kurz und natürlich auf Deutsch (max 1-2 Sätze).
Verhalte dich wie ein normaler Kunde am Telefon.`,
          skipGreeting: true // Customer waits for agent to greet first
        }
      );

      // Listen for customer transcriptions (what customer hears from agent)
      this.customerPipeline.on('transcription', (data) => {
        this.transcriptCount++;
        logger.info({
          speaker: data.speaker,
          text: data.text,
          count: this.transcriptCount,
          source: 'CUSTOMER-HÖRT'
        }, '🎧 [CUSTOMER HÖRT AGENT] 💬');

        // Record in transcript verifier
        if (this.transcriptVerifier) {
          this.transcriptVerifier.addTranscript({
            source: 'CUSTOMER-HÖRT',
            speaker: data.speaker,
            text: data.text
          });
        }

        // After hearing the agent's greeting, customer responds ONCE
        if (!this.customerHasSpoken && data.text.includes('helfen')) {
          this.customerHasSpoken = true;
          setTimeout(async () => {
            const customerMessage = 'Ich möchte meinen Zählerstand melden';
            logger.info({ text: customerMessage }, '🗣️ Customer speaking');

            try {
              // Generate TTS audio directly (returns PCM)
              const audioBuffer = await this.ttsProvider.synthesize(customerMessage, 'de');

              // Send via RTP
              rtpHandler.sendAudio(audioBuffer);

              // Record the transcript manually since we're bypassing the pipeline
              this.transcriptCount++;
              if (this.transcriptVerifier) {
                this.transcriptVerifier.addTranscript({
                  source: 'CUSTOMER-SAGT',
                  speaker: 'customer',
                  text: customerMessage
                });
              }
              logger.info({ text: customerMessage, source: 'CUSTOMER-SAGT' }, '🗣️ [CUSTOMER SAGT] 💬');
            } catch (error) {
              logger.error({ error }, 'Failed to generate customer speech');
            }
          }, 500); // Wait 500ms before responding
        }
      });

      // Listen for customer responses (when customer speaks)
      this.customerPipeline.on('agentResponse', (data) => {
        logger.info({
          speaker: data.speaker,
          text: data.text,
          source: 'CUSTOMER-SAGT'
        }, '🗣️ [CUSTOMER SAGT] 💬');

        // Record in transcript verifier
        if (this.transcriptVerifier) {
          this.transcriptVerifier.addTranscript({
            source: 'CUSTOMER-SAGT',
            speaker: data.speaker,
            text: data.text
          });
        }
      });

      // Log when customer receives audio
      rtpHandler.on('audio', (audioData) => {
        // This is audio the customer receives (agent via B2BUA)
        logger.debug({
          source: 'CUSTOMER-EMPFÄNGT',
          bytes: audioData.length,
          direction: 'Agent → B2BUA → Customer'
        }, '📡 [CUSTOMER EMPFÄNGT AUDIO]');
      });

      await this.customerPipeline.start();
      logger.info({ callId }, '🎤 Customer pipeline started');
    });

    this.customerServer.on('callEnded', async ({ callId }) => {
      logger.info({ callId }, '📴 CUSTOMER CALL ENDED');
      if (this.customerPipeline) {
        await this.customerPipeline.stop();
        this.customerPipeline = null;
      }
    });

    this.customerServer.on('callFailed', ({ callId, statusCode, statusText }) => {
      logger.error({ callId, statusCode, statusText }, '❌ CUSTOMER CALL FAILED');
    });

    await this.customerServer.start();
    logger.info('✅ Customer Simulator started on port 5062');
  }

  /**
   * Initiate test call from customer to B2BUA
   */
  private async initiateTestCall(): Promise<void> {
    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('🎬 STARTING AUTOMATED TEST CALL');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');

    try {
      // Peer-to-Peer: Call directly to B2BUA on localhost:5060
      const callId = await this.customerServer.initiateOutboundCall({
        toUri: 'sip:b2bua@192.168.188.86:5060',
        fromDisplayName: 'Test Customer'
      });

      logger.info({ callId }, '📞 Customer initiated call to B2BUA');
      logger.info('');
      logger.info('🔄 Expected flow:');
      logger.info('   1. Customer (lkschroeder) → B2BUA (cwschroeder)');
      logger.info('   2. B2BUA bridges to → Agent (pjschroeder)');
      logger.info('   3. 3-Party conference established');
      logger.info('   4. Transcriptions start flowing');
      logger.info('');
      logger.info('⏱️  Call will run for 10 seconds, then auto-hangup...');

      // Auto-hangup after 10 seconds
      setTimeout(async () => {
        logger.info('');
        logger.info('⏱️  10 seconds elapsed, hanging up test call...');
        await this.customerServer.terminateCall(callId);
      }, 10000);

    } catch (error) {
      logger.error({ error }, '❌ Failed to initiate test call');
    }
  }

  /**
   * Generate and print verification report
   */
  private generateVerificationReport(): void {
    if (!this.transcriptVerifier) return;

    logger.info('');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('📊 Generating Transcript Verification Report');
    logger.info('═══════════════════════════════════════════════════');
    logger.info('');

    // Print all transcripts
    this.transcriptVerifier.printAllTranscripts();

    // Print statistics
    const stats = this.transcriptVerifier.getStatistics();
    logger.info('');
    logger.info('📈 Statistics:');
    logger.info(`   Total Transcripts: ${stats.totalTranscripts}`);
    logger.info(`   Average Length: ${stats.averageLength.toFixed(0)} characters`);
    logger.info('');
    logger.info('   By Source:');
    Object.entries(stats.bySource).forEach(([source, count]) => {
      logger.info(`      ${source}: ${count}`);
    });
    logger.info('');

    // Compare Customer Says vs B2BUA Leg A (should be identical)
    logger.info('🔍 Comparing: CUSTOMER-SAGT vs B2BUA-LEG-A');
    logger.info('   (Customer speech should reach B2BUA)');
    this.transcriptVerifier.printComparison('CUSTOMER-SAGT', 'B2BUA-LEG-A');

    // Compare B2BUA vs Agent (should be identical)
    logger.info('🔍 Comparing: B2BUA-LEG-A vs AGENT-HÖRT');
    logger.info('   (B2BUA should forward customer audio to Agent)');
    this.transcriptVerifier.printComparison('B2BUA-LEG-A', 'AGENT-HÖRT');

    // Compare Agent Says vs Customer Hears (should be identical)
    logger.info('🔍 Comparing: AGENT-SAGT vs CUSTOMER-HÖRT');
    logger.info('   (Agent responses should reach Customer)');
    this.transcriptVerifier.printComparison('AGENT-SAGT', 'CUSTOMER-HÖRT');

    // Verify audio flow
    const verification = this.transcriptVerifier.verifyAudioFlow();
    logger.info(verification.report);

    // Export transcripts
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const jsonFile = `./test-transcripts-${timestamp}.json`;
    const csvFile = `./test-transcripts-${timestamp}.csv`;

    this.transcriptVerifier.exportToJSON(jsonFile);
    this.transcriptVerifier.exportToCSV(csvFile);

    logger.info('');
    logger.info('📁 Transcripts exported:');
    logger.info(`   JSON: ${jsonFile}`);
    logger.info(`   CSV: ${csvFile}`);
    logger.info('');
  }

  async stop(): Promise<void> {
    logger.info('🛑 Stopping Test Environment');

    if (this.agentPipeline) {
      await this.agentPipeline.stop();
    }

    if (this.customerPipeline) {
      await this.customerPipeline.stop();
    }

    await this.b2buaManager.cleanup();
    await this.b2buaServer.stop();
    await this.agentServer.stop();
    await this.customerServer.stop();

    logger.info('✅ Test Environment stopped');
  }
}

// Main test execution
async function runTest() {
  logger.info('');
  logger.info('═══════════════════════════════════════════════════');
  logger.info('🧪 B2BUA 3-Party Conference Test');
  logger.info('═══════════════════════════════════════════════════');
  logger.info('');

  const testManager = new B2BUATestManager();

  // Graceful shutdown
  process.on('SIGINT', async () => {
    logger.info('');
    logger.info('Received SIGINT, shutting down...');
    await testManager.stop();
    process.exit(0);
  });

  process.on('SIGTERM', async () => {
    logger.info('');
    logger.info('Received SIGTERM, shutting down...');
    await testManager.stop();
    process.exit(0);
  });

  try {
    await testManager.start();

    // Keep alive
    await new Promise(() => {}); // Run forever until Ctrl+C

  } catch (error) {
    logger.error({ error }, '❌ Test failed');
    await testManager.stop();
    process.exit(1);
  }
}

// Run
runTest().catch((error) => {
  logger.error({ error }, '❌ Unhandled error');
  process.exit(1);
});
