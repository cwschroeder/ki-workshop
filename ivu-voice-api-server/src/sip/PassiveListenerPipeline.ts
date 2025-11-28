import { EventEmitter } from 'events';
import type { ProviderRegistry } from '../providers/ProviderRegistry';
import type { ISTTProvider } from '../providers/ai/ISTTProvider';
import type { IDenoiserProvider } from '../providers/audio/IDenoiserProvider';
import { RTPAudioHandler } from './RTPAudioHandler';
import { VADBuffer, type VADBufferOptions } from './VADBuffer';
import { pcmToWav } from './AudioUtils';

export interface PassiveListenerOptions {
  /**
   * STT provider name (e.g., 'openai', 'whisper')
   */
  sttProvider?: string;

  /**
   * Language for transcription (default: 'de')
   */
  language?: string;

  /**
   * Send comfort noise to keep connection alive (default: true)
   */
  sendComfortNoise?: boolean;

  /**
   * Comfort noise interval in ms (default: 20ms)
   */
  comfortNoiseIntervalMs?: number;

  /**
   * VAD options for utterance detection
   */
  vadOptions?: Partial<VADBufferOptions>;

  /**
   * Denoiser provider name (e.g., 'rnnoise', 'none')
   * Set to 'none' or omit to disable noise suppression
   */
  denoiserProvider?: string;
}

interface TranscriptionEvent {
  callId: string;
  text: string;
  timestamp: Date;
  isFinal: boolean;
  durationMs?: number;
}

/**
 * Passive Listener Pipeline
 *
 * A "ghost participant" that joins a call, listens only, and transcribes.
 * Used for live call monitoring without speaking.
 *
 * Features:
 * - Receives mixed audio from conference call
 * - Sends silence/comfort noise to keep RTP alive
 * - Transcribes audio using STT
 * - Streams live transcripts via events
 * - No LLM/TTS - purely passive
 */
export class PassiveListenerPipeline extends EventEmitter {
  private registry: ProviderRegistry;
  private sttProvider: ISTTProvider;
  private denoiserProvider: IDenoiserProvider | null = null;
  private rtpHandler: RTPAudioHandler;
  private vadBuffer: VADBuffer;
  private callId: string;
  private options: PassiveListenerOptions;

  private isStopped: boolean = false;
  private comfortNoiseInterval: NodeJS.Timeout | null = null;
  private transcriptionCount: number = 0;
  private startTime: Date;

  private readonly SAMPLE_RATE = 8000;

  constructor(
    callId: string,
    rtpHandler: RTPAudioHandler,
    registry: ProviderRegistry,
    options: PassiveListenerOptions = {}
  ) {
    super();
    this.callId = callId;
    this.rtpHandler = rtpHandler;
    this.registry = registry;
    this.options = {
      sttProvider: 'openai',
      language: 'de',
      sendComfortNoise: true,
      comfortNoiseIntervalMs: 20,
      ...options
    };
    this.startTime = new Date();

    // Get STT provider
    const sttName = this.options.sttProvider || 'openai';
    this.sttProvider = registry.getSTT(sttName);

    // Get Denoiser provider if specified and not 'none'
    const denoiserName = this.options.denoiserProvider;
    if (denoiserName && denoiserName !== 'none' && registry.hasDenoiser(denoiserName)) {
      this.denoiserProvider = registry.getDenoiser(denoiserName);
      console.log(
        `[PassiveListener:${callId}] Noise suppression enabled with provider: ${denoiserName}`
      );
    }

    // Create VAD buffer for utterance detection
    const vadOptions: VADBufferOptions = {
      sampleRate: this.SAMPLE_RATE,
      silenceThresholdDb: -40,
      silenceDurationMs: 500,
      minUtteranceDurationMs: 300,
      maxUtteranceDurationMs: 30000, // 30 seconds max for long utterances
      ...options.vadOptions
    };
    this.vadBuffer = new VADBuffer(callId, vadOptions);

    const denoiserInfo = this.denoiserProvider ? `, denoiser=${this.denoiserProvider.name}` : '';
    console.log(
      `[PassiveListener:${callId}] Initialized with STT=${sttName}, language=${this.options.language}${denoiserInfo}`
    );
  }

  /**
   * Start the passive listener
   */
  async start(): Promise<void> {
    console.log(`[PassiveListener:${this.callId}] Starting passive monitoring`);

    // Listen for incoming audio
    this.rtpHandler.on('audio', async (audioData: Buffer) => {
      if (!this.isStopped) {
        let processedAudio = audioData;

        // Apply noise suppression if enabled (per-RTP-packet)
        if (this.denoiserProvider) {
          try {
            processedAudio = await this.denoiserProvider.process(audioData, {
              sampleRate: this.SAMPLE_RATE
            });
          } catch (error) {
            // Graceful degradation: use original audio on error
            console.error(`[PassiveListener:${this.callId}] Denoise error:`, error);
          }
        }

        this.vadBuffer.ingest(processedAudio);
      }
    });

    // Handle complete utterances from VAD
    this.vadBuffer.on('utterance', async (audioData: Buffer) => {
      await this.transcribeUtterance(audioData);
    });

    // Start sending comfort noise to keep RTP alive
    if (this.options.sendComfortNoise) {
      this.startComfortNoise();
    }

    // Emit started event
    this.emit('started', {
      callId: this.callId,
      timestamp: new Date()
    });

    console.log(`[PassiveListener:${this.callId}] Monitoring active`);
  }

  /**
   * Transcribe a complete utterance
   */
  private async transcribeUtterance(audioData: Buffer): Promise<void> {
    try {
      const durationMs = (audioData.length / 2 / this.SAMPLE_RATE) * 1000;

      // Skip audio that's too short for Whisper (minimum 0.1s = 100ms)
      if (durationMs < 150) {
        console.log(
          `[PassiveListener:${this.callId}] Skipping short audio: ${durationMs.toFixed(0)}ms (min 150ms)`
        );
        return;
      }

      // Convert PCM to WAV for STT
      const wavBuffer = pcmToWav(audioData, this.SAMPLE_RATE);

      console.log(
        `[PassiveListener:${this.callId}] Transcribing ${durationMs.toFixed(0)}ms of audio`
      );

      // Transcribe
      const text = await this.sttProvider.transcribe(wavBuffer, {
        language: this.options.language || 'de'
      });

      if (text && text.trim()) {
        const trimmedText = text.trim();

        // Filter known Whisper hallucinations (common artifacts from silence/noise)
        const hallucinations = [
          'untertitel',
          'amara.org',
          'untertitelung aufgrund der audioqualität nicht möglich',
          'vielen dank für ihre aufmerksamkeit',
          'vielen dank für die aufmerksamkeit',
          "vielen dank für's zuhören",
          'vielen dank fürs zuhören',
          'bis zum nächsten mal',
          'thank you for watching',
          'thanks for watching',
          'subscribe',
          'like and subscribe',
          'copyright',
          'www.',
          'http'
        ];

        const lowerText = trimmedText.toLowerCase();
        const isHallucination = hallucinations.some(h => lowerText.includes(h));

        if (isHallucination) {
          console.log(`[PassiveListener:${this.callId}] Filtered hallucination: "${trimmedText}"`);
          return;
        }

        this.transcriptionCount++;

        const event: TranscriptionEvent = {
          callId: this.callId,
          text: trimmedText,
          timestamp: new Date(),
          isFinal: true,
          durationMs
        };

        console.log(`[PassiveListener:${this.callId}] Transcript: "${trimmedText}"`);

        // Emit transcription event
        this.emit('transcription', event);
      }
    } catch (error) {
      console.error(`[PassiveListener:${this.callId}] Transcription error:`, error);
      this.emit('error', { callId: this.callId, error });
    }
  }

  /**
   * Start sending comfort noise to keep RTP session alive
   * Some PBXs/SBCs drop connections if no RTP is received
   */
  private startComfortNoise(): void {
    const intervalMs = this.options.comfortNoiseIntervalMs || 20;
    const samplesPerPacket = (this.SAMPLE_RATE * intervalMs) / 1000;
    const silenceBuffer = Buffer.alloc(samplesPerPacket * 2); // 16-bit samples

    // Mark first packet with RTP marker bit
    this.rtpHandler.setMarkerForNextPacket();

    this.comfortNoiseInterval = setInterval(() => {
      if (!this.isStopped) {
        this.rtpHandler.sendAudio(silenceBuffer);
      }
    }, intervalMs);

    console.log(
      `[PassiveListener:${this.callId}] Comfort noise started (${intervalMs}ms interval)`
    );
  }

  /**
   * Stop the passive listener
   */
  async stop(): Promise<void> {
    if (this.isStopped) return;

    console.log(`[PassiveListener:${this.callId}] Stopping`);
    this.isStopped = true;

    // Stop comfort noise
    if (this.comfortNoiseInterval) {
      clearInterval(this.comfortNoiseInterval);
      this.comfortNoiseInterval = null;
    }

    // Flush any remaining audio in VAD buffer
    this.vadBuffer.flush();

    // Remove listeners
    this.rtpHandler.removeAllListeners('audio');
    this.vadBuffer.removeAllListeners('utterance');

    const sessionDuration = Date.now() - this.startTime.getTime();

    // Emit stopped event with stats
    this.emit('stopped', {
      callId: this.callId,
      timestamp: new Date(),
      stats: {
        durationMs: sessionDuration,
        transcriptionCount: this.transcriptionCount
      }
    });

    console.log(
      `[PassiveListener:${this.callId}] Stopped after ${(sessionDuration / 1000).toFixed(1)}s, ${this.transcriptionCount} transcriptions`
    );
  }

  /**
   * Get current stats
   */
  getStats(): {
    callId: string;
    isActive: boolean;
    startTime: Date;
    durationMs: number;
    transcriptionCount: number;
  } {
    return {
      callId: this.callId,
      isActive: !this.isStopped,
      startTime: this.startTime,
      durationMs: Date.now() - this.startTime.getTime(),
      transcriptionCount: this.transcriptionCount
    };
  }
}
