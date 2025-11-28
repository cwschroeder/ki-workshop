/**
 * Faster-Whisper STT Provider
 *
 * Uses faster-whisper-server with OpenAI-compatible API.
 * @see https://github.com/fedirz/faster-whisper-server
 *
 * API: POST /v1/audio/transcriptions (OpenAI-compatible)
 */

import type { ISTTProvider } from '../ISTTProvider';
import type { TranscribeOptions } from '../IAIProvider';

export class FasterWhisperProvider implements ISTTProvider {
  readonly name = 'whisper';
  private baseUrl: string;
  private defaultModel: string;

  constructor(
    baseUrl: string = 'http://localhost:8000',
    defaultModel: string = 'Systran/faster-whisper-large-v3'
  ) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  async transcribe(audioBuffer: Buffer, options: TranscribeOptions): Promise<string> {
    try {
      // faster-whisper-server uses OpenAI-compatible API
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'audio.wav');
      formData.append('model', options.model || this.defaultModel);
      formData.append('language', options.language);

      const response = await fetch(`${this.baseUrl}/v1/audio/transcriptions`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`FasterWhisper API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const result = await response.json() as { text: string };
      return result.text;
    } catch (error) {
      console.error('[FasterWhisperProvider] Transcription failed:', error);
      if (error instanceof Error && error.message.includes('FasterWhisper API error')) {
        throw error;
      }
      throw new Error(`FasterWhisper transcription failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}
