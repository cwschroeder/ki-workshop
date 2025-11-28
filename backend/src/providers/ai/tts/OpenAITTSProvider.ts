/**
 * OpenAI TTS Provider
 *
 * Uses OpenAI TTS API for text-to-speech.
 */

import OpenAI from 'openai';
import type { ITTSProvider } from '../ITTSProvider';
import type { SynthesizeOptions } from '../IAIProvider';

export class OpenAITTSProvider implements ITTSProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  async synthesize(text: string, options: SynthesizeOptions): Promise<Buffer> {
    try {
      // Strip SSML tags as OpenAI doesn't support them
      const cleanText = text.replace(/<[^>]*>/g, '').trim();

      const mp3 = await this.client.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: options.voice as 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer',
        input: cleanText,
        response_format: 'mp3',
        speed: options.speed || 1.0
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer;
    } catch (error) {
      console.error('[OpenAITTSProvider] Speech synthesis failed:', error);
      throw new Error('Speech synthesis failed');
    }
  }
}
