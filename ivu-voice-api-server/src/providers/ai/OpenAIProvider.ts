/**
 * OpenAI Provider Implementation
 *
 * Uses OpenAI API for:
 * - STT: Whisper
 * - TTS: OpenAI TTS
 * - LLM: GPT-4
 */

import OpenAI from 'openai';
import type {
  IAIProvider,
  ChatMessage,
  TranscribeOptions,
  SynthesizeOptions,
  ChatOptions,
  ExtractedInfo
} from './IAIProvider';

export class OpenAIProvider implements IAIProvider {
  readonly name = 'OpenAI';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

  /**
   * Speech-to-Text using Whisper
   */
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
      console.error('[OpenAIProvider] Transcription failed:', error);
      throw new Error('Transcription failed');
    }
  }

  /**
   * Text-to-Speech using OpenAI TTS
   */
  async synthesize(text: string, options: SynthesizeOptions): Promise<Buffer> {
    try {
      // Strip SSML tags as OpenAI doesn't support them
      const cleanText = text.replace(/<[^>]*>/g, '').trim();

      const mp3 = await this.client.audio.speech.create({
        model: 'gpt-4o-mini-tts',
        voice: options.voice as any, // 'alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'
        input: cleanText,
        response_format: 'mp3',
        speed: options.speed || 1.0
      });

      const buffer = Buffer.from(await mp3.arrayBuffer());
      return buffer;
    } catch (error) {
      console.error('[OpenAIProvider] Speech synthesis failed:', error);
      throw new Error('Speech synthesis failed');
    }
  }

  /**
   * Chat completion using GPT-4
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      const systemMessage = options?.systemPrompt
        ? { role: 'system' as const, content: options.systemPrompt }
        : null;

      const allMessages = systemMessage ? [systemMessage, ...messages] : messages;

      const completion = await this.client.chat.completions.create({
        model: options?.model || 'gpt-4o-mini',
        messages: allMessages,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.maxTokens ?? 150
      });

      const response = completion.choices[0]?.message?.content || '';
      return response;
    } catch (error) {
      console.error('[OpenAIProvider] Chat completion failed:', error);
      throw new Error('Chat completion failed');
    }
  }

  /**
   * Extract structured information from text
   */
  async extractNumbers(text: string): Promise<ExtractedInfo> {
    try {
      const systemPrompt = `Du bist ein Assistent, der strukturierte Informationen aus gesprochenem Text extrahiert.

Extrahiere folgende Informationen:
- Kundennummer (customer_number): Eine numerische ID
- Zählernummer (meter_number): Eine alphanumerische ID (z.B. M-789)
- Zählerstand (reading): Ein numerischer Wert

Antworte im JSON-Format:
{
  "customer_number": "12345" oder null,
  "meter_number": "M-789" oder null,
  "reading": 5432 oder null
}

Wenn keine Information erkennbar ist, setze den Wert auf null.`;

      const completion = await this.client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: text }
        ],
        temperature: 0.3,
        max_tokens: 100
      });

      const responseText = completion.choices[0]?.message?.content?.trim() || '{}';

      try {
        const parsed = JSON.parse(responseText);
        return {
          customerNumber: parsed.customer_number || undefined,
          meterNumber: parsed.meter_number || undefined,
          reading: parsed.reading ? Number(parsed.reading) : undefined
        };
      } catch (parseError) {
        console.warn('[OpenAIProvider] Failed to parse extraction result:', responseText);
        return {};
      }
    } catch (error) {
      console.error('[OpenAIProvider] Number extraction failed:', error);
      return {};
    }
  }
}
