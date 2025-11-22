/**
 * Text-to-Speech Provider Interface
 * Allows swapping between OpenAI TTS, Coqui TTS, Piper, etc.
 */

export interface TTSProvider {
  /**
   * Generate speech audio from text
   * @param text - Text to synthesize
   * @param language - Language code (e.g., 'de', 'en')
   * @returns PCM audio buffer (16-bit, mono, 8000Hz for telephony)
   */
  synthesize(
    text: string,
    language: string
  ): Promise<Buffer>;

  /**
   * Get audio format details
   */
  getAudioFormat(): {
    sampleRate: number;
    channels: number;
    bitDepth: number;
  };

  /**
   * Get provider name for logging
   */
  getName(): string;
}
