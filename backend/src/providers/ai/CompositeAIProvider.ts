/**
 * Composite AI Provider
 *
 * Wraps the ProviderRegistry to implement the IAIProvider interface.
 * Provides backwards compatibility with code that expects a single AI provider.
 *
 * Allows per-request provider selection via options.provider field.
 */

import type {
  IAIProvider,
  ChatMessage,
  TranscribeOptions,
  SynthesizeOptions,
  ChatOptions,
  ExtractedInfo
} from './IAIProvider';
import type { ProviderRegistry } from '../ProviderRegistry';

export class CompositeAIProvider implements IAIProvider {
  readonly name = 'Composite';

  constructor(
    private registry: ProviderRegistry,
    private defaultSTT: string = 'openai',
    private defaultTTS: string = 'openai',
    private defaultLLM: string = 'openai'
  ) {}

  /**
   * Speech-to-Text using the specified or default STT provider
   */
  async transcribe(audioBuffer: Buffer, options: TranscribeOptions): Promise<string> {
    const providerName = options.provider || this.defaultSTT;
    const provider = this.registry.getSTT(providerName);
    return provider.transcribe(audioBuffer, options);
  }

  /**
   * Text-to-Speech using the specified or default TTS provider
   */
  async synthesize(text: string, options: SynthesizeOptions): Promise<Buffer> {
    const providerName = options.provider || this.defaultTTS;
    const provider = this.registry.getTTS(providerName);
    return provider.synthesize(text, options);
  }

  /**
   * Chat completion using the specified or default LLM provider
   */
  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const providerName = options?.provider || this.defaultLLM;
    const provider = this.registry.getLLM(providerName);
    return provider.chat(messages, options);
  }

  /**
   * Extract structured information using the specified or default LLM provider
   */
  async extractNumbers(text: string): Promise<ExtractedInfo> {
    const provider = this.registry.getLLM(this.defaultLLM);
    return provider.extractNumbers(text);
  }

  /**
   * Get the underlying registry for direct access
   */
  getRegistry(): ProviderRegistry {
    return this.registry;
  }

  /**
   * Get available providers for each type
   */
  getAvailableProviders(): { stt: string[]; tts: string[]; llm: string[] } {
    return this.registry.getSummary();
  }
}
