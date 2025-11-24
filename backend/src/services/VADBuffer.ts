import { EventEmitter } from 'events';
import { createLogger } from '../utils/logger';

const logger = createLogger({ service: 'VADBuffer' });

export interface VADBufferOptions {
  sampleRate: number;                // e.g., 8000 Hz
  silenceThresholdDb: number;        // e.g., -40dB
  silenceDurationMs: number;         // e.g., 500ms of silence = end of utterance
  minUtteranceDurationMs: number;    // e.g., 500ms minimum to avoid noise
  maxUtteranceDurationMs?: number;   // OPTIONAL: e.g., 10s maximum (force flush). Omit for unlimited duration.
}

export interface VADBufferEvent {
  utterance: (audioData: Buffer) => void;
}

/**
 * Voice Activity Detection Buffer
 *
 * Automatically detects speech pauses using audio energy analysis
 * and emits complete utterances for transcription.
 *
 * Usage:
 * ```typescript
 * const vadBuffer = new VADBuffer({
 *   sampleRate: 8000,
 *   silenceThresholdDb: -40,
 *   silenceDurationMs: 500,
 *   minUtteranceDurationMs: 500,
 *   maxUtteranceDurationMs: 10000
 * });
 *
 * vadBuffer.on('utterance', async (audioData) => {
 *   const transcript = await stt.transcribe(audioData);
 *   console.log(transcript);
 * });
 *
 * // Feed audio packets (e.g., 20ms RTP packets)
 * rtpHandler.on('audio', (packet) => {
 *   vadBuffer.ingest(packet);
 * });
 *
 * // Flush on call end
 * call.on('end', () => vadBuffer.flush());
 * ```
 */
export class VADBuffer extends EventEmitter {
  private buffer: Buffer[] = [];
  private silenceBuffer: Buffer[] = [];
  private isInUtterance: boolean = false;
  private utteranceStartTime: number = 0;
  private lastAudioTime: number = 0;
  private options: VADBufferOptions;
  private sessionId: string;

  constructor(sessionId: string, options: VADBufferOptions) {
    super();
    this.sessionId = sessionId;
    this.options = options;
  }

  /**
   * Ingest audio data (typically 20ms RTP packets)
   * Automatically detects utterance boundaries and emits complete utterances
   */
  ingest(audioData: Buffer): void {
    const now = Date.now();
    this.lastAudioTime = now;

    const isSilence = this.detectSilence(audioData);

    if (isSilence) {
      this.silenceBuffer.push(audioData);

      // Check if silence duration exceeds threshold
      const silenceDuration = this.silenceBuffer.length * 20; // 20ms per packet
      if (silenceDuration >= this.options.silenceDurationMs && this.isInUtterance) {
        // End of utterance detected
        const utteranceDuration = now - this.utteranceStartTime;

        if (utteranceDuration >= this.options.minUtteranceDurationMs) {
          logger.debug({
            sessionId: this.sessionId,
            utteranceDuration,
            bufferSize: this.buffer.length
          }, 'VAD: Utterance end detected (silence threshold)');
          this.emitUtterance();
        } else {
          logger.debug({
            sessionId: this.sessionId,
            utteranceDuration,
            minRequired: this.options.minUtteranceDurationMs
          }, 'VAD: Discarding short utterance (noise)');
        }

        this.resetUtterance();
      }
    } else {
      // Voice detected
      if (!this.isInUtterance) {
        this.isInUtterance = true;
        this.utteranceStartTime = now;
        logger.debug({
          sessionId: this.sessionId
        }, 'VAD: Utterance start detected');
      }

      // Include any buffered silence (for natural transitions)
      if (this.silenceBuffer.length > 0) {
        this.buffer.push(...this.silenceBuffer);
        this.silenceBuffer = [];
      }

      this.buffer.push(audioData);

      // Force flush if utterance is too long (prevent buffer overflow) - only if max duration is configured
      if (this.options.maxUtteranceDurationMs !== undefined) {
        const utteranceDuration = now - this.utteranceStartTime;
        if (utteranceDuration >= this.options.maxUtteranceDurationMs) {
          logger.debug({
            sessionId: this.sessionId,
            utteranceDuration,
            maxAllowed: this.options.maxUtteranceDurationMs
          }, 'VAD: Forcing utterance flush (max duration)');
          this.emitUtterance();
          this.resetUtterance();
        }
      }
    }
  }

  /**
   * Detect silence using RMS (Root Mean Square) energy analysis
   * Converts audio energy to decibels and compares to threshold
   */
  private detectSilence(audioData: Buffer): boolean {
    // Calculate RMS (Root Mean Square) energy
    let sumSquares = 0;
    const numSamples = audioData.length / 2; // 16-bit samples (2 bytes per sample)

    for (let i = 0; i < audioData.length; i += 2) {
      const sample = audioData.readInt16LE(i);
      sumSquares += sample * sample;
    }

    const rms = Math.sqrt(sumSquares / numSamples);

    // Convert to decibels (normalize to 16-bit range: -32768 to 32767)
    const db = 20 * Math.log10(rms / 32768);

    const isSilence = db < this.options.silenceThresholdDb;

    // Log occasionally for debugging
    if (Math.random() < 0.01) { // 1% sampling
      logger.debug({
        sessionId: this.sessionId,
        rms: rms.toFixed(2),
        db: db.toFixed(2),
        threshold: this.options.silenceThresholdDb,
        isSilence
      }, 'VAD: Audio energy sample');
    }

    return isSilence;
  }

  /**
   * Emit buffered utterance for transcription
   */
  private emitUtterance(): void {
    if (this.buffer.length === 0) return;

    const utterance = Buffer.concat(this.buffer);
    const durationMs = (utterance.length / 2 / this.options.sampleRate) * 1000;

    logger.info({
      sessionId: this.sessionId,
      bufferSize: this.buffer.length,
      totalBytes: utterance.length,
      durationMs: durationMs.toFixed(0)
    }, 'VAD: Emitting utterance for transcription');

    this.emit('utterance', utterance);
  }

  /**
   * Reset utterance state (start fresh)
   */
  private resetUtterance(): void {
    this.buffer = [];
    this.silenceBuffer = [];
    this.isInUtterance = false;
  }

  /**
   * Flush any remaining buffered audio (call on session end)
   */
  flush(): void {
    if (this.buffer.length > 0) {
      logger.info({
        sessionId: this.sessionId,
        bufferSize: this.buffer.length
      }, 'VAD: Flushing remaining buffer');
      this.emitUtterance();
      this.resetUtterance();
    }
  }
}
