/**
 * Speech-to-Text Provider Interface
 * Allows swapping between OpenAI Whisper, Whisper.cpp, Vosk, etc.
 */

export interface STTProvider {
  /**
   * Transcribe audio buffer to text
   * @param audioBuffer - PCM audio data (16-bit, mono)
   * @param sampleRate - Audio sample rate (e.g., 16000, 8000)
   * @param language - Language code (e.g., 'de', 'en')
   * @returns Transcribed text
   */
  transcribe(
    audioBuffer: Buffer,
    sampleRate: number,
    language: string
  ): Promise<string>;

  /**
   * Get provider name for logging
   */
  getName(): string;
}
