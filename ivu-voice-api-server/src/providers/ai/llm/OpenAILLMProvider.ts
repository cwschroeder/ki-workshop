/**
 * OpenAI LLM Provider
 *
 * Uses OpenAI GPT API for chat completions.
 */

import OpenAI from 'openai';
import type { ILLMProvider } from '../ILLMProvider';
import type { ChatMessage, ChatOptions, ExtractedInfo } from '../IAIProvider';

export class OpenAILLMProvider implements ILLMProvider {
  readonly name = 'openai';
  private client: OpenAI;

  constructor(apiKey: string) {
    this.client = new OpenAI({ apiKey });
  }

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
      console.error('[OpenAILLMProvider] Chat completion failed:', error);
      throw new Error('Chat completion failed');
    }
  }

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
        console.warn('[OpenAILLMProvider] Failed to parse extraction result:', responseText);
        return {};
      }
    } catch (error) {
      console.error('[OpenAILLMProvider] Number extraction failed:', error);
      return {};
    }
  }
}
