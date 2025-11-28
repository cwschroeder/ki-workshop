/**
 * LLM Provider Interface
 *
 * Abstraction for LLM services like OpenAI GPT, Ollama, etc.
 */

import type { ChatMessage, ChatOptions, ExtractedInfo } from './IAIProvider';

export interface ILLMProvider {
  /**
   * Provider name for logging/debugging
   */
  readonly name: string;

  /**
   * Generate a chat completion
   * @param messages - Conversation history
   * @param options - Chat options (systemPrompt, temperature, maxTokens, model)
   * @returns Generated response text
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;

  /**
   * Extract structured information from text
   * Helper for extracting customer numbers, meter readings, etc.
   * @param text - Text to analyze
   * @returns Extracted information
   */
  extractNumbers(text: string): Promise<ExtractedInfo>;
}
