import { EventEmitter } from 'events';
import { STTProvider } from '../providers/STTProvider';
import { LLMProvider, Message } from '../providers/LLMProvider';
import { TTSProvider } from '../providers/TTSProvider';
import { RTPAudioHandler } from './RTPAudioHandler';
import { logger } from '../utils/logger';

export interface PipelineOptions {
  /**
   * If true, only transcribe audio without LLM/TTS responses
   * Useful for passive monitoring/transcription of calls
   */
  listenOnlyMode?: boolean;

  /**
   * Speaker identifier for transcription events (e.g., 'customer', 'agent')
   */
  speakerLabel?: string;

  /**
   * Custom system prompt for the LLM
   * If not provided, uses default agent prompt
   */
  systemPrompt?: string;

  /**
   * If true, skip sending the initial greeting
   * Useful for customer-side pipelines that should wait for agent greeting
   */
  skipGreeting?: boolean;
}

/**
 * Voice Agent Pipeline
 * Orchestrates the STT → LLM → TTS flow with Voice Activity Detection
 * Can also run in listen-only mode for passive transcription
 */
export class VoiceAgentPipeline extends EventEmitter {
  private sttProvider: STTProvider;
  private llmProvider: LLMProvider;
  private ttsProvider: TTSProvider;
  private rtpHandler: RTPAudioHandler;
  private callId: string;
  private options: PipelineOptions;

  private conversationHistory: Message[] = [];
  private audioBuffer: Buffer = Buffer.alloc(0);
  private isProcessing: boolean = false;
  private isSpeaking: boolean = false;
  private isStopped: boolean = false;
  private shouldInterrupt: boolean = false;
  private speakingStartTime: number = 0;

  private readonly SAMPLE_RATE = 8000;
  private readonly LANGUAGE = 'de';
  private readonly INTERRUPT_THRESHOLD = this.SAMPLE_RATE * 2 * 3; // 3 seconds to interrupt (reduce false positives from background noise)
  private readonly INTERRUPT_COOLDOWN_MS = 1000; // 1 second cooldown before allowing interrupts

  constructor(
    callId: string,
    rtpHandler: RTPAudioHandler,
    sttProvider: STTProvider,
    llmProvider: LLMProvider,
    ttsProvider: TTSProvider,
    options: PipelineOptions = {}
  ) {
    super();
    this.callId = callId;
    this.rtpHandler = rtpHandler;
    this.sttProvider = sttProvider;
    this.llmProvider = llmProvider;
    this.ttsProvider = ttsProvider;
    this.options = options;
  }

  /**
   * Start the voice agent pipeline
   */
  async start(): Promise<void> {
    const mode = this.options.listenOnlyMode ? 'listen-only' : 'interactive';
    logger.info({ callId: this.callId, mode, speaker: this.options.speakerLabel }, 'Starting voice agent pipeline');

    // Listen for incoming audio
    this.rtpHandler.on('audio', (audioData: Buffer) => {
      this.handleIncomingAudio(audioData);
    });

    // In listen-only mode, skip greeting and LLM setup
    if (this.options.listenOnlyMode) {
      logger.info({ callId: this.callId }, 'Pipeline in listen-only mode: only transcribing');
      return;
    }

    // Interactive mode: Set system prompt
    const systemPrompt = this.options.systemPrompt || `Du bist ein freundlicher Kundenservice-Agent des Stadtwerks.
Du hilfst Kunden bei Fragen zu ihren Zählerständen und Energieverbrauch.
Halte deine Antworten kurz und präzise (max 2-3 Sätze).
Sprich auf Deutsch.`;

    this.conversationHistory.push({
      role: 'system',
      content: systemPrompt
    });

    // Send a short burst of silence immediately to open RTP path
    this.rtpHandler.sendSilence(200).catch((err) => {
      logger.warn({ callId: this.callId, error: err }, 'Failed to send RTP priming silence');
    });

    // Send greeting (unless skipped)
    if (!this.options.skipGreeting) {
      await this.sendGreeting();
    }
  }

  /**
   * Send initial greeting
   */
  private async sendGreeting(): Promise<void> {
    const greeting = 'Guten Tag. Willkommen beim Stadtwerk. Wie kann ich Ihnen heute helfen?';
    this.conversationHistory.push({ role: 'assistant', content: greeting });
    await this.speak(greeting);
  }

  /**
   * Handle incoming audio from RTP
   */
  private handleIncomingAudio(audioData: Buffer): void {
    // ALWAYS buffer incoming audio (full-duplex)
    this.audioBuffer = Buffer.concat([this.audioBuffer, audioData]);

    // DEBUG: Log every 50 packets to see if audio is arriving
    const packetCount = Math.floor(this.audioBuffer.length / 320);
    if (packetCount % 50 === 0 && packetCount > 0) {
      logger.info({
        callId: this.callId,
        bufferBytes: this.audioBuffer.length,
        bufferSeconds: (this.audioBuffer.length / (this.SAMPLE_RATE * 2)).toFixed(2),
        isSpeaking: this.isSpeaking,
        isProcessing: this.isProcessing
      }, '📊 Agent pipeline audio buffer status');
    }

    // Don't process while already processing
    if (this.isProcessing) {
      return;
    }

    // Check for interrupt if agent is speaking
    if (this.isSpeaking) {
      // Only allow interrupts after cooldown period (prevents false positives from audio during TTS generation)
      const timeSpoken = Date.now() - this.speakingStartTime;
      if (timeSpoken >= this.INTERRUPT_COOLDOWN_MS) {
        // If user speaks for 3 seconds while agent talks, trigger interrupt
        if (this.audioBuffer.length >= this.INTERRUPT_THRESHOLD) {
          logger.info({ callId: this.callId, bufferSize: this.audioBuffer.length }, 'User interrupting agent');
          this.shouldInterrupt = true;
          // Don't process yet - let speak() finish naturally, then process
          return;
        }
      }
      // NOTE: We don't return here! Agent can still listen while speaking (full-duplex)
    }

    // VAD: Check if we have enough audio (2 seconds)
    const minBufferSize = this.SAMPLE_RATE * 2 * 2; // 2 seconds, 16-bit samples

    if (this.audioBuffer.length >= minBufferSize) {
      // Process the buffered audio
      this.processAudioBuffer();
    }
  }

  /**
   * Process accumulated audio buffer
   */
  private async processAudioBuffer(): Promise<void> {
    if (this.isProcessing || this.audioBuffer.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      const audioToProcess = this.audioBuffer;
      this.audioBuffer = Buffer.alloc(0); // Clear buffer

      // Transcribe
      logger.info({ callId: this.callId, bufferSize: audioToProcess.length }, 'Transcribing audio');
      const transcription = await this.sttProvider.transcribe(
        audioToProcess,
        this.SAMPLE_RATE,
        this.LANGUAGE
      );

      if (!transcription || transcription.trim() === '') {
        logger.info({ callId: this.callId }, 'Empty transcription');
        this.isProcessing = false;
        return;
      }

      logger.info({
        callId: this.callId,
        transcription,
        speaker: this.options.speakerLabel || 'user'
      }, 'Transcribed speech');

      // Emit transcription event for external consumers (e.g., dashboard, CSV storage)
      this.emit('transcription', {
        callId: this.callId,
        speaker: this.options.speakerLabel || 'user',
        text: transcription,
        timestamp: new Date()
      });

      // In listen-only mode, skip LLM and TTS
      if (this.options.listenOnlyMode) {
        this.isProcessing = false;
        return;
      }

      // Interactive mode: Continue with LLM and TTS
      this.conversationHistory.push({ role: 'user', content: transcription });

      // Get LLM response
      const response = await this.llmProvider.generateResponse(this.conversationHistory);
      logger.info({ callId: this.callId, response }, 'Agent responds');
      this.conversationHistory.push({ role: 'assistant', content: response });

      // Emit event when agent responds (before speaking)
      this.emit('agentResponse', {
        callId: this.callId,
        speaker: this.options.speakerLabel || 'assistant',
        text: response,
        timestamp: new Date()
      });

      // Speak response
      await this.speak(response);

    } catch (error) {
      logger.error({ callId: this.callId, error }, 'Error processing audio');
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Generate speech and send via RTP
   */
  private async speak(text: string): Promise<void> {
    if (this.isStopped) {
      logger.warn({ callId: this.callId }, 'Skipping speak: pipeline stopped');
      return;
    }

    const startedAt = Date.now();

    try {
      logger.info({ callId: this.callId, text }, 'Generating speech');

      // Generate TTS (NOT speaking yet, so user interrupts are queued)
      const audioBuffer = await this.ttsProvider.synthesize(text, this.LANGUAGE);

      if (this.isStopped) {
        logger.warn({ callId: this.callId }, 'Discarding speech: pipeline stopped');
        return;
      }

      // Clear any buffered audio BEFORE starting to speak
      // This prevents false interrupts from audio that arrived during TTS generation
      this.audioBuffer = Buffer.alloc(0);

      // NOW we start speaking and check for interrupts
      this.speakingStartTime = Date.now();
      this.isSpeaking = true;
      this.shouldInterrupt = false; // Reset interrupt flag

      // Stream audio in chunks via RTP
      const chunkSize = 320; // 20ms at 8kHz, 16-bit = 320 bytes
      let offset = 0;
      let packets = 0;
      let bytes = 0;

      // Mark start of talkspurt so RTP sets marker bit
      this.rtpHandler.setMarkerForNextPacket();

      while (offset < audioBuffer.length) {
        // Check for interrupts or stop
        if (this.isStopped) {
          logger.warn({ callId: this.callId }, 'Stopping speech mid-playback: pipeline stopped');
          break;
        }

        if (this.shouldInterrupt) {
          logger.info({ callId: this.callId, playedMs: Date.now() - startedAt }, 'Speech interrupted by user');
          break;
        }

        const chunk = audioBuffer.slice(offset, offset + chunkSize);
        this.rtpHandler.sendAudio(chunk);
        packets += 1;
        bytes += chunk.length;

        // Wait 20ms between chunks for real-time playback
        await new Promise(resolve => setTimeout(resolve, 20));

        offset += chunkSize;
      }

      if (!this.isStopped && !this.shouldInterrupt) {
        logger.info({ callId: this.callId, durationMs: Date.now() - startedAt, packets, bytes }, 'Speech playback completed');
      }

    } catch (error) {
      logger.error({
        callId: this.callId,
        error,
        errorMessage: error instanceof Error ? error.message : String(error),
        errorStack: error instanceof Error ? error.stack : undefined
      }, 'Error generating speech');
    } finally {
      this.isSpeaking = false;

      // If interrupted, process the buffered user audio immediately
      if (this.shouldInterrupt && this.audioBuffer.length > 0) {
        logger.info({ callId: this.callId }, 'Processing user input after interrupt');
        this.shouldInterrupt = false;
        // Give a tiny delay for any remaining audio to arrive
        await new Promise(resolve => setTimeout(resolve, 100));
        this.processAudioBuffer();
      }
    }
  }

  /**
   * Stop the pipeline
   */
  async stop(): Promise<void> {
    logger.info({ callId: this.callId }, 'Stopping voice agent pipeline');
    this.isStopped = true;
    this.rtpHandler.removeAllListeners('audio');
    this.conversationHistory = [];
    this.audioBuffer = Buffer.alloc(0);
  }
}

