/**
 * Provider Registry
 *
 * Central registry for all AI providers (STT, TTS, LLM).
 * Allows runtime selection of providers per request.
 */

import type { ISTTProvider } from './ai/ISTTProvider';
import type { ITTSProvider } from './ai/ITTSProvider';
import type { ILLMProvider } from './ai/ILLMProvider';
import type { IDenoiserProvider } from './audio/IDenoiserProvider';

export class ProviderNotFoundError extends Error {
  constructor(type: 'STT' | 'TTS' | 'LLM' | 'Denoiser', name: string, available: string[]) {
    super(
      `${type} provider '${name}' not found. Available providers: ${available.length > 0 ? available.join(', ') : 'none'}`
    );
    this.name = 'ProviderNotFoundError';
  }
}

export class ProviderRegistry {
  private sttProviders = new Map<string, ISTTProvider>();
  private ttsProviders = new Map<string, ITTSProvider>();
  private llmProviders = new Map<string, ILLMProvider>();
  private denoiserProviders = new Map<string, IDenoiserProvider>();

  // ==================== STT ====================

  /**
   * Register an STT provider
   */
  registerSTT(name: string, provider: ISTTProvider): void {
    this.sttProviders.set(name, provider);
    console.log(`[ProviderRegistry] Registered STT provider: ${name}`);
  }

  /**
   * Get an STT provider by name
   * @throws ProviderNotFoundError if provider not registered
   */
  getSTT(name: string): ISTTProvider {
    const provider = this.sttProviders.get(name);
    if (!provider) {
      throw new ProviderNotFoundError('STT', name, this.getAvailableSTTProviders());
    }
    return provider;
  }

  /**
   * Check if an STT provider is registered
   */
  hasSTT(name: string): boolean {
    return this.sttProviders.has(name);
  }

  /**
   * Get list of available STT provider names
   */
  getAvailableSTTProviders(): string[] {
    return Array.from(this.sttProviders.keys());
  }

  // ==================== TTS ====================

  /**
   * Register a TTS provider
   */
  registerTTS(name: string, provider: ITTSProvider): void {
    this.ttsProviders.set(name, provider);
    console.log(`[ProviderRegistry] Registered TTS provider: ${name}`);
  }

  /**
   * Get a TTS provider by name
   * @throws ProviderNotFoundError if provider not registered
   */
  getTTS(name: string): ITTSProvider {
    const provider = this.ttsProviders.get(name);
    if (!provider) {
      throw new ProviderNotFoundError('TTS', name, this.getAvailableTTSProviders());
    }
    return provider;
  }

  /**
   * Check if a TTS provider is registered
   */
  hasTTS(name: string): boolean {
    return this.ttsProviders.has(name);
  }

  /**
   * Get list of available TTS provider names
   */
  getAvailableTTSProviders(): string[] {
    return Array.from(this.ttsProviders.keys());
  }

  // ==================== LLM ====================

  /**
   * Register an LLM provider
   */
  registerLLM(name: string, provider: ILLMProvider): void {
    this.llmProviders.set(name, provider);
    console.log(`[ProviderRegistry] Registered LLM provider: ${name}`);
  }

  /**
   * Get an LLM provider by name
   * @throws ProviderNotFoundError if provider not registered
   */
  getLLM(name: string): ILLMProvider {
    const provider = this.llmProviders.get(name);
    if (!provider) {
      throw new ProviderNotFoundError('LLM', name, this.getAvailableLLMProviders());
    }
    return provider;
  }

  /**
   * Check if an LLM provider is registered
   */
  hasLLM(name: string): boolean {
    return this.llmProviders.has(name);
  }

  /**
   * Get list of available LLM provider names
   */
  getAvailableLLMProviders(): string[] {
    return Array.from(this.llmProviders.keys());
  }

  // ==================== Denoiser ====================

  /**
   * Register a Denoiser provider
   */
  registerDenoiser(name: string, provider: IDenoiserProvider): void {
    this.denoiserProviders.set(name, provider);
    console.log(`[ProviderRegistry] Registered Denoiser provider: ${name}`);
  }

  /**
   * Get a Denoiser provider by name
   * @throws ProviderNotFoundError if provider not registered
   */
  getDenoiser(name: string): IDenoiserProvider {
    const provider = this.denoiserProviders.get(name);
    if (!provider) {
      throw new ProviderNotFoundError('Denoiser', name, this.getAvailableDenoiserProviders());
    }
    return provider;
  }

  /**
   * Check if a Denoiser provider is registered
   */
  hasDenoiser(name: string): boolean {
    return this.denoiserProviders.has(name);
  }

  /**
   * Get list of available Denoiser provider names
   */
  getAvailableDenoiserProviders(): string[] {
    return Array.from(this.denoiserProviders.keys());
  }

  // ==================== Utility ====================

  /**
   * Get summary of all registered providers
   */
  getSummary(): { stt: string[]; tts: string[]; llm: string[]; denoiser: string[] } {
    return {
      stt: this.getAvailableSTTProviders(),
      tts: this.getAvailableTTSProviders(),
      llm: this.getAvailableLLMProviders(),
      denoiser: this.getAvailableDenoiserProviders()
    };
  }

  /**
   * Log all registered providers
   */
  logRegisteredProviders(): void {
    const summary = this.getSummary();
    console.log('[ProviderRegistry] Registered providers:');
    console.log(`  STT: ${summary.stt.length > 0 ? summary.stt.join(', ') : '(none)'}`);
    console.log(`  TTS: ${summary.tts.length > 0 ? summary.tts.join(', ') : '(none)'}`);
    console.log(`  LLM: ${summary.llm.length > 0 ? summary.llm.join(', ') : '(none)'}`);
    console.log(`  Denoiser: ${summary.denoiser.length > 0 ? summary.denoiser.join(', ') : '(none)'}`);
  }
}
