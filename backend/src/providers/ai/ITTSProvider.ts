/**
 * Text-to-Speech Provider Interface
 *
 * Abstraction for TTS services like OpenAI TTS, Coqui TTS, etc.
 */

import type { SynthesizeOptions } from './IAIProvider';

export interface ITTSProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Synthesize text to audio
   * @param text - Text to convert to speech
   * @param options - Synthesis options (voice, language, speed)
   * @returns Audio data as Buffer
   */
  synthesize(text: string, options: SynthesizeOptions): Promise<Buffer>;
}
