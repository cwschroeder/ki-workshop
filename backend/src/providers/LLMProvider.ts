/**
 * Large Language Model Provider Interface
 * Allows swapping between OpenAI GPT, Llama, Mixtral, etc.
 */

export interface Message {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LLMProvider {
  /**
   * Generate a response based on conversation history
   * @param messages - Conversation history
   * @param maxTokens - Maximum response length
   * @returns Generated response text
   */
  generateResponse(
    messages: Message[],
    maxTokens?: number
  ): Promise<string>;

  /**
   * Get provider name for logging
   */
  getName(): string;
}
