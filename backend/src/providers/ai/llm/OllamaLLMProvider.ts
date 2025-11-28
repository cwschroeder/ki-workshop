/**
 * Ollama LLM Provider
 *
 * Uses Ollama API for local LLM chat completions.
 * @see https://github.com/ollama/ollama
 *
 * API: POST /api/chat
 */

import type { ILLMProvider } from '../ILLMProvider';
import type { ChatMessage, ChatOptions, ExtractedInfo } from '../IAIProvider';

export class OllamaLLMProvider implements ILLMProvider {
  readonly name = 'ollama';
  private baseUrl: string;
  private defaultModel: string;

  constructor(
    baseUrl: string = 'http://localhost:11434',
    defaultModel: string = 'llama3.1'
  ) {
    this.baseUrl = baseUrl;
    this.defaultModel = defaultModel;
  }

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      const systemMessage = options?.systemPrompt
        ? { role: 'system' as const, content: options.systemPrompt }
        : null;

      const allMessages = systemMessage ? [systemMessage, ...messages] : messages;

      const response = await fetch(`${this.baseUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options?.model || this.defaultModel,
          messages: allMessages,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 150
          }
        })
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Ollama API error: ${response.status} ${response.statusText} - ${errorText}`);
      }

      const data = await response.json() as { message: { content: string } };
      return data.message.content;
    } catch (error) {
      console.error('[OllamaLLMProvider] Chat completion failed:', error);
      if (error instanceof Error && error.message.includes('Ollama API error')) {
        throw error;
      }
      throw new Error(`Ollama chat failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async extractNumbers(text: string): Promise<ExtractedInfo> {
    try {
      const systemPrompt = `Du bist ein Assistent, der strukturierte Informationen aus gesprochenem Text extrahiert.

Extrahiere folgende Informationen:
- Kundennummer (customer_number): Eine numerische ID
- Zählernummer (meter_number): Eine alphanumerische ID (z.B. M-789)
- Zählerstand (reading): Ein numerischer Wert

Antworte NUR im JSON-Format, ohne zusätzlichen Text:
{
  "customer_number": "12345" oder null,
  "meter_number": "M-789" oder null,
  "reading": 5432 oder null
}

Wenn keine Information erkennbar ist, setze den Wert auf null.`;

      const response = await this.chat(
        [{ role: 'user', content: text }],
        { systemPrompt, temperature: 0.3, maxTokens: 100 }
      );

      try {
        // Try to extract JSON from response (in case model adds extra text)
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
          console.warn('[OllamaLLMProvider] No JSON found in response:', response);
          return {};
        }

        const parsed = JSON.parse(jsonMatch[0]);
        return {
          customerNumber: parsed.customer_number || undefined,
          meterNumber: parsed.meter_number || undefined,
          reading: parsed.reading ? Number(parsed.reading) : undefined
        };
      } catch (parseError) {
        console.warn('[OllamaLLMProvider] Failed to parse extraction result:', response);
        return {};
      }
    } catch (error) {
      console.error('[OllamaLLMProvider] Number extraction failed:', error);
      return {};
    }
  }
}
