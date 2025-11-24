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

/**
 * Create AI Provider based on environment configuration
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
