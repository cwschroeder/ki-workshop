/**
 * AI Provider Interface
 *
 * This interface abstracts AI capabilities (STT, TTS, LLM) to allow
 * easy switching between providers (OpenAI, local LLM, etc.)
 */

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TranscribeOptions {
  language: string;
  model?: string;
}

export interface SynthesizeOptions {
  voice: string;
  language: string;
  speed?: number;
}

export interface ChatOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  model?: string;
}

export interface ExtractedInfo {
  customerNumber?: string;
  meterNumber?: string;
  reading?: number;
  rawNumbers?: string[];
}

/**
 * AI Provider Interface
 *
 * Implementations:
 * - OpenAIProvider: Uses OpenAI API (Whisper, GPT-4, TTS)
 * - LocalLLMProvider: Uses local models (Ollama, whisper.cpp, etc.)
 */
export interface IAIProvider {
  /**
   * Speech-to-Text (STT)
   * Transcribes audio to text
   */
  transcribe(audioBuffer: Buffer, options: TranscribeOptions): Promise<string>;

  /**
   * Text-to-Speech (TTS)
   * Synthesizes text to audio
   */
  synthesize(text: string, options: SynthesizeOptions): Promise<Buffer>;

  /**
   * LLM Chat Completion
   * Generates conversational responses
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;

  /**
   * Extract structured information from text
   * Helper for extracting customer numbers, meter readings, etc.
   */
  extractNumbers(text: string): Promise<ExtractedInfo>;

  /**
   * Provider name for logging/debugging
   */
  readonly name: string;
}
