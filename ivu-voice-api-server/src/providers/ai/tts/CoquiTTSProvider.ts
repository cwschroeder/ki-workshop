/**
 * Coqui TTS Provider
 *
 * Uses Coqui TTS Server for text-to-speech.
 * @see https://github.com/coqui-ai/TTS
 *
 * API: GET /api/tts?text=...&speaker_id=...&language_id=...
 * Alternative: POST with JSON body
 */

import type { ITTSProvider } from '../ITTSProvider';
import type { SynthesizeOptions } from '../IAIProvider';

export class CoquiTTSProvider implements ITTSProvider {
  readonly name = 'coqui';
  private baseUrl: string;
  private defaultVoice: string;

  constructor(
    baseUrl: string = 'http://localhost:5002',
    defaultVoice: string = 'thorsten'
  ) {
    this.baseUrl = baseUrl;
    this.defaultVoice = defaultVoice;
  }

  async synthesize(text: string, options: SynthesizeOptions): Promise<Buffer> {
    try {
      // Strip SSML tags as Coqui doesn't support them
      const cleanText = text.replace(/<[^>]*>/g, '').trim();

      // Coqui TTS API: GET /api/tts?text=...&speaker_id=...
      const params = new URLSearchParams({
        text: cleanText,
        speaker_id: options.voice || this.defaultVoice,
        language_id: options.language || 'de'
      });

      const response = await fetch(`${this.baseUrl}/api/tts?${params}`, {
        method: 'GET'
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`CoquiTTS API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      // Coqui returns WAV audio
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('[CoquiTTSProvider] Speech synthesis failed:', error);
      if (error instanceof Error && error.message.includes('CoquiTTS API error')) {
        throw error;
      }
      throw new Error(`CoquiTTS synthesis failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
