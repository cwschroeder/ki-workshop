/**
 * Speech-to-Text Provider Interface
 *
 * Abstraction for STT services like OpenAI Whisper, faster-whisper, etc.
 */

import type { TranscribeOptions } from './IAIProvider';

export interface ISTTProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Transcribe audio to text
   * @param audioBuffer - Audio data as Buffer
   * @param options - Transcription options (language, model)
   * @returns Transcribed text
   */
  transcribe(audioBuffer: Buffer, options: TranscribeOptions): Promise<string>;
}
