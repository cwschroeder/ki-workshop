import { OpenAI } from 'openai';
import { LLMProvider, Message } from '../LLMProvider';
import { logger } from '../../utils/logger';

/**
 * OpenAI GPT Language Model Provider
 */
export class OpenAILLMProvider implements LLMProvider {
  private openai: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string = 'gpt-4o-mini') {
    this.openai = new OpenAI({ apiKey });
    this.model = model;
  }

  async generateResponse(
    messages: Message[],
    maxTokens: number = 150
  ): Promise<string> {
    try {
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        temperature: 0.2, // keep answers deterministic for predictable dialogues
        max_tokens: maxTokens,
      });

      return response.choices[0]?.message?.content ||
        'Entschuldigung, ich habe das nicht verstanden.';
    } catch (error) {
      logger.error({ error }, 'OpenAI LLM generation failed');
      return 'Entschuldigung, es gab einen technischen Fehler.';
    }
  }

  getName(): string {
    return `OpenAI ${this.model}`;
  }
}
