/**
 * Provider Factory
 *
 * Creates AI and Telephony provider instances based on environment configuration.
 * Handles provider selection and initialization.
 */

import { env } from '../config/env';
import type { IAIProvider } from './ai/IAIProvider';
import type { ITelephonyProvider } from './telephony/ITelephonyProvider';
import { OpenAIProvider } from './ai/OpenAIProvider';
import { LocalLLMProvider } from './ai/LocalLLMProvider';
import { TeniosProvider } from './telephony/TeniosProvider';
import { ProviderRegistry } from './ProviderRegistry';

// STT Providers
import { OpenAISTTProvider } from './ai/stt/OpenAISTTProvider';
import { FasterWhisperProvider } from './ai/stt/FasterWhisperProvider';

// TTS Providers
import { OpenAITTSProvider } from './ai/tts/OpenAITTSProvider';
import { CoquiTTSProvider } from './ai/tts/CoquiTTSProvider';

// LLM Providers
import { OpenAILLMProvider } from './ai/llm/OpenAILLMProvider';
import { OllamaLLMProvider } from './ai/llm/OllamaLLMProvider';

// Denoiser Providers
import { NullDenoiserProvider, RNNoiseProvider, DTLNProvider } from './audio/denoiser';

/**
 * Create Provider Registry with all enabled providers
 */
export function createProviderRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();

  // ===== STT Providers =====
  if (env.STT_OPENAI_ENABLED && env.OPENAI_API_KEY) {
    registry.registerSTT('openai', new OpenAISTTProvider(env.OPENAI_API_KEY));
  }
  if (env.STT_WHISPER_ENABLED && env.STT_WHISPER_URL) {
    registry.registerSTT('whisper', new FasterWhisperProvider(
      env.STT_WHISPER_URL,
      env.STT_WHISPER_MODEL
    ));
  }

  // ===== TTS Providers =====
  if (env.TTS_OPENAI_ENABLED && env.OPENAI_API_KEY) {
    registry.registerTTS('openai', new OpenAITTSProvider(env.OPENAI_API_KEY));
  }
  if (env.TTS_COQUI_ENABLED && env.TTS_COQUI_URL) {
    registry.registerTTS('coqui', new CoquiTTSProvider(
      env.TTS_COQUI_URL,
      env.TTS_COQUI_VOICE
    ));
  }

  // ===== LLM Providers =====
  if (env.LLM_OPENAI_ENABLED && env.OPENAI_API_KEY) {
    registry.registerLLM('openai', new OpenAILLMProvider(env.OPENAI_API_KEY));
  }
  if (env.LLM_OLLAMA_ENABLED && env.LLM_OLLAMA_URL) {
    registry.registerLLM('ollama', new OllamaLLMProvider(
      env.LLM_OLLAMA_URL,
      env.LLM_OLLAMA_MODEL
    ));
  }

  // ===== Denoiser Providers (sync registration, async init later) =====
  // Always register 'none' as passthrough/fallback
  const nullDenoiser = new NullDenoiserProvider();
  registry.registerDenoiser('none', nullDenoiser);

  registry.logRegisteredProviders();
  return registry;
}

/**
 * Initialize async providers (WASM modules, etc.)
 * Call this after createProviderRegistry() to initialize denoiser providers
 */
export async function initializeAsyncProviders(registry: ProviderRegistry): Promise<void> {
  const initPromises: Promise<void>[] = [];

  // Initialize NullDenoiserProvider
  if (registry.hasDenoiser('none')) {
    const nullDenoiser = registry.getDenoiser('none');
    initPromises.push(nullDenoiser.initialize());
  }

  // Initialize RNNoiseProvider if enabled
  if (env.DENOISER_RNNOISE_ENABLED) {
    try {
      const rnnoise = new RNNoiseProvider({
        quality: env.DENOISER_RNNOISE_QUALITY as 'low' | 'medium' | 'high' | undefined
      });
      initPromises.push(
        rnnoise.initialize().then(() => {
          registry.registerDenoiser('rnnoise', rnnoise);
        })
      );
    } catch (error) {
      console.warn('[ProviderFactory] Failed to create RNNoiseProvider:', error);
    }
  }

  // Initialize DTLNProvider if enabled
  if (env.DENOISER_DTLN_ENABLED) {
    try {
      const dtln = new DTLNProvider({
        quality: env.DENOISER_DTLN_QUALITY as 'low' | 'medium' | 'high' | undefined
      });
      initPromises.push(
        dtln.initialize().then(() => {
          registry.registerDenoiser('dtln', dtln);
        })
      );
    } catch (error) {
      console.warn('[ProviderFactory] Failed to create DTLNProvider:', error);
    }
  }

  await Promise.all(initPromises);
  console.log('[ProviderFactory] Async providers initialized');
}

/**
 * Create AI Provider based on environment configuration
 * @deprecated Use createProviderRegistry() for granular provider selection
 */
export function createAIProvider(): IAIProvider {
  console.log(`[ProviderFactory] Creating AI provider: ${env.AI_PROVIDER}`);

  if (env.AI_PROVIDER === 'openai') {
    if (!env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY is required when AI_PROVIDER=openai');
    }
    return new OpenAIProvider(env.OPENAI_API_KEY);
  }

  if (env.AI_PROVIDER === 'local-llm') {
    if (!env.LOCAL_LLM_URL) {
      throw new Error('LOCAL_LLM_URL is required when AI_PROVIDER=local-llm');
    }
    return new LocalLLMProvider({
      ollamaUrl: env.LOCAL_LLM_URL,
      whisperUrl: env.WHISPER_URL,
      ttsUrl: env.TTS_URL
    });
  }

  throw new Error(`Unknown AI provider: ${env.AI_PROVIDER}`);
}

/**
 * Create Telephony Provider
 * Currently only TENIOS is supported, but easily extensible
 */
export function createTelephonyProvider(): ITelephonyProvider {
  console.log('[ProviderFactory] Creating Telephony provider: TENIOS');

  // Future: Could support multiple providers based on env variable
  // if (env.TELEPHONY_PROVIDER === 'twilio') return new TwilioProvider();
  // if (env.TELEPHONY_PROVIDER === 'vonage') return new VonageProvider();

  if (!env.TENIOS_API_KEY) {
    throw new Error('TENIOS_API_KEY is required');
  }

  return new TeniosProvider(env.TENIOS_API_KEY);
}
