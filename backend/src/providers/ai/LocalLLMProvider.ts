/**
 * Local LLM Provider Implementation
 *
 * Uses local models for:
 * - STT: whisper.cpp / faster-whisper
 * - TTS: Piper / Coqui TTS
 * - LLM: Ollama (Llama 3.1, Gemma 2, etc.)
 *
 * This is a placeholder for future migration from OpenAI to local models.
 * The interface remains identical to OpenAIProvider, allowing zero-code migration.
 */

import type {
  IAIProvider,
  ChatMessage,
  TranscribeOptions,
  SynthesizeOptions,
  ChatOptions,
  ExtractedInfo
} from './IAIProvider';

export class LocalLLMProvider implements IAIProvider {
  readonly name = 'LocalLLM';
  private ollamaUrl: string;
  private whisperUrl: string;
  private ttsUrl: string;

  constructor(config: {
    ollamaUrl?: string;
    whisperUrl?: string;
    ttsUrl?: string;
  }) {
    this.ollamaUrl = config.ollamaUrl || 'http://localhost:11434';
    this.whisperUrl = config.whisperUrl || 'http://localhost:9000';
    this.ttsUrl = config.ttsUrl || 'http://localhost:5000';
  }

  /**
   * Speech-to-Text using local Whisper
   * (e.g., whisper.cpp server or faster-whisper API)
   */
  async transcribe(audioBuffer: Buffer, options: TranscribeOptions): Promise<string> {
    try {
      const formData = new FormData();
      formData.append('file', new Blob([audioBuffer]), 'audio.wav');
      formData.append('language', options.language);

      const response = await fetch(`${this.whisperUrl}/inference`, {
        method: 'POST',
        body: formData
      });

      if (!response.ok) {
        throw new Error(`Whisper API error: ${response.statusText}`);
      }

      const data = await response.json() as { text: string };
      return data.text;
    } catch (error) {
      console.error('[LocalLLMProvider] Transcription failed:', error);
      throw new Error('Transcription failed');
    }
  }

  /**
   * Text-to-Speech using local TTS
   * (e.g., Piper or Coqui TTS)
   */
  async synthesize(text: string, options: SynthesizeOptions): Promise<Buffer> {
    try {
      const response = await fetch(`${this.ttsUrl}/api/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: text,
          voice: options.voice,
          language: options.language,
          speed: options.speed || 1.0
        })
      });

      if (!response.ok) {
        throw new Error(`TTS API error: ${response.statusText}`);
      }

      const audioBuffer = await response.arrayBuffer();
      return Buffer.from(audioBuffer);
    } catch (error) {
      console.error('[LocalLLMProvider] Speech synthesis failed:', error);
      throw new Error('Speech synthesis failed');
    }
  }

  /**
   * Chat completion using Ollama
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    try {
      const systemMessage = options?.systemPrompt
        ? { role: 'system' as const, content: options.systemPrompt }
        : null;

      const allMessages = systemMessage ? [systemMessage, ...messages] : messages;

      const response = await fetch(`${this.ollamaUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: options?.model || 'llama3.1',
          messages: allMessages,
          stream: false,
          options: {
            temperature: options?.temperature ?? 0.7,
            num_predict: options?.maxTokens ?? 150
          }
        })
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.statusText}`);
      }

      const data = await response.json() as { message: { content: string } };
      return data.message.content;
    } catch (error) {
      console.error('[LocalLLMProvider] Chat completion failed:', error);
      throw new Error('Chat completion failed');
    }
  }

  /**
   * Extract structured information from text using local LLM
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

      const response = await this.chat(
        [{ role: 'user', content: text }],
        { systemPrompt, temperature: 0.3, maxTokens: 100 }
      );

      try {
        const parsed = JSON.parse(response);
        return {
          customerNumber: parsed.customer_number || undefined,
          meterNumber: parsed.meter_number || undefined,
          reading: parsed.reading ? Number(parsed.reading) : undefined
        };
      } catch (parseError) {
        console.warn('[LocalLLMProvider] Failed to parse extraction result:', response);
        return {};
      }
    } catch (error) {
      console.error('[LocalLLMProvider] Number extraction failed:', error);
      return {};
    }
  }
}
