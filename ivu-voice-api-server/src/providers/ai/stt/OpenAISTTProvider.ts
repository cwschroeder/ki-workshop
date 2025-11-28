/**
 * OpenAI STT Provider
 *
 * Uses OpenAI Whisper API for speech-to-text.
 */

import OpenAI from 'openai';
import type { ISTTProvider } from '../ISTTProvider';
import type { TranscribeOptions } from '../IAIProvider';

export class OpenAISTTProvider implements ISTTProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async transcribe(audioBuffer: Buffer, options: TranscribeOptions): Promise<string> {
    try {
      const file = new File([audioBuffer], 'audio.wav', { type: 'audio/wav' });

      const transcription = await this.client.audio.transcriptions.create({
        file: file,
        model: options.model || 'whisper-1',
        language: options.language
      });

      return transcription.text;
    } catch (error) {
      console.error('[OpenAISTTProvider] Transcription failed:', error);
      throw new Error('Transcription failed');
    }
  }
}
