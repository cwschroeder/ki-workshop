import { EventEmitter } from 'events';
import { STTProvider } from '../providers/STTProvider';
import { LLMProvider, Message } from '../providers/LLMProvider';
import { TTSProvider } from '../providers/TTSProvider';
import { RTPAudioHandler } from './RTPAudioHandler';
import { logger } from '../utils/logger';

/**
 * Voice Agent Pipeline
 * Orchestrates the STT → LLM → TTS flow with Voice Activity Detection
 */
export class VoiceAgentPipeline extends EventEmitter {
  private sttProvider: STTProvider;
  private llmProvider: LLMProvider;
  private ttsProvider: TTSProvider;
  private rtpHandler: RTPAudioHandler;
  private callId: string;

  private conversationHistory: Message[] = [];
  private audioBuffer: Buffer = Buffer.alloc(0);
  private isProcessing: boolean = false;
  private isSpeaking: boolean = false;
  private isStopped: boolean = false;

  private readonly SAMPLE_RATE = 8000;
  private readonly LANGUAGE = 'de';

  constructor(
    callId: string,
    rtpHandler: RTPAudioHandler,
    sttProvider: STTProvider,
    llmProvider: LLMProvider,
    ttsProvider: TTSProvider
  ) {
    super();
    this.callId = callId;
    this.rtpHandler = rtpHandler;
    this.sttProvider = sttProvider;
    this.llmProvider = llmProvider;
    this.ttsProvider = ttsProvider;
  }

  /**
   * Start the voice agent pipeline
   */
  async start(): Promise<void> {
    logger.info({ callId: this.callId }, 'Starting voice agent pipeline');

    // Set system prompt
    this.conversationHistory.push({
      role: 'system',
      content: `Du bist ein freundlicher Kundenservice-Agent des Stadtwerks.
Du hilfst Kunden bei Fragen zu ihren Zählerständen und Energieverbrauch.
Halte deine Antworten kurz und präzise (max 2-3 Sätze).
Sprich auf Deutsch.`
    });

    // Listen for incoming audio
    this.rtpHandler.on('audio', (audioData: Buffer) => {
      this.handleIncomingAudio(audioData);
    });

    // Send a short burst of silence immediately to open RTP path
    this.rtpHandler.sendSilence(200).catch((err) => {
      logger.warn({ callId: this.callId, error: err }, 'Failed to send RTP priming silence');
    });

    // Send greeting
    await this.sendGreeting();
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
    // Don't process audio while we're speaking
    if (this.isSpeaking || this.isProcessing) {
      return;
    }

    // Append to buffer
    this.audioBuffer = Buffer.concat([this.audioBuffer, audioData]);

    // Simple VAD: Check if we have enough audio (e.g., 2 seconds)
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

      logger.info({ callId: this.callId, transcription }, 'User said');
      this.conversationHistory.push({ role: 'user', content: transcription });

      // Get LLM response
      const response = await this.llmProvider.generateResponse(this.conversationHistory);
      logger.info({ callId: this.callId, response }, 'Agent responds');
      this.conversationHistory.push({ role: 'assistant', content: response });

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

    this.isSpeaking = true;
    const startedAt = Date.now();

    try {
      logger.info({ callId: this.callId, text }, 'Generating speech');

      // Generate TTS
      const audioBuffer = await this.ttsProvider.synthesize(text, this.LANGUAGE);

      if (this.isStopped) {
        logger.warn({ callId: this.callId }, 'Discarding speech: pipeline stopped');
      }

      // Stream audio in chunks via RTP
      const chunkSize = 320; // 20ms at 8kHz, 16-bit = 320 bytes
      let offset = 0;
      let packets = 0;
      let bytes = 0;

      // Mark start of talkspurt so RTP sets marker bit
      this.rtpHandler.setMarkerForNextPacket();

      while (offset < audioBuffer.length) {
        if (this.isStopped) {
          logger.warn({ callId: this.callId }, 'Stopping speech mid-playback: pipeline stopped');
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

      if (!this.isStopped) {
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
