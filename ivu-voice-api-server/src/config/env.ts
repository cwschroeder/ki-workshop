/**
 * Environment Configuration
 *
 * Validates and provides type-safe access to environment variables
 */

import { z } from 'zod';
import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

const envSchema = z.object({
  // ===== IVU Voice API Configuration =====
  IVU_API_KEY: z.string().optional(), // For future client authentication

  // ===== TENIOS Configuration =====
  TENIOS_API_KEY: z.string().min(1, 'TENIOS_API_KEY is required'),
  TENIOS_WEBHOOK_URL: z.string().url().optional(),

  // ===== AI Provider Configuration (Legacy) =====
  AI_PROVIDER: z.enum(['openai', 'local-llm']).default('openai'),

  // OpenAI (only required when AI_PROVIDER=openai)
  OPENAI_API_KEY: z.string().optional(),

  // Local LLM (only required when AI_PROVIDER=local-llm)
  LOCAL_LLM_URL: z.string().url().optional(),
  WHISPER_URL: z.string().url().optional(),
  TTS_URL: z.string().url().optional(),

  // ===== Granular Provider Configuration =====
  // STT Providers
  STT_OPENAI_ENABLED: z.coerce.boolean().default(true),
  STT_WHISPER_ENABLED: z.coerce.boolean().default(false),
  STT_WHISPER_URL: z.string().url().optional().default('http://localhost:8000'),
  STT_WHISPER_MODEL: z.string().optional().default('Systran/faster-whisper-large-v3'),

  // TTS Providers
  TTS_OPENAI_ENABLED: z.coerce.boolean().default(true),
  TTS_COQUI_ENABLED: z.coerce.boolean().default(false),
  TTS_COQUI_URL: z.string().url().optional().default('http://localhost:5002'),
  TTS_COQUI_VOICE: z.string().optional().default('thorsten'),

  // LLM Providers
  LLM_OPENAI_ENABLED: z.coerce.boolean().default(true),
  LLM_OLLAMA_ENABLED: z.coerce.boolean().default(false),
  LLM_OLLAMA_URL: z.string().url().optional().default('http://localhost:11434'),
  LLM_OLLAMA_MODEL: z.string().optional().default('llama3.1'),

  // Default Providers (used when request doesn't specify)
  DEFAULT_STT_PROVIDER: z.string().default('openai'),
  DEFAULT_TTS_PROVIDER: z.string().default('openai'),
  DEFAULT_LLM_PROVIDER: z.string().default('openai'),

  // ===== Server Configuration =====
  PORT: z.coerce.number().int().positive().default(3001),
  WS_PORT: z.coerce.number().int().positive().default(3002),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ===== Workshop Configuration =====
  WORKSHOP_DATA_DIR: z.string().default('../workshop-data'),
  MAX_CONCURRENT_CALLS: z.coerce.number().int().positive().default(10),

  // ===== Optional Features =====
  ENABLE_CORS: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // ===== SIP Server Configuration =====
  SIP_ENABLED: z.coerce.boolean().default(false),
  SIP_MODE: z.enum(['voicebot', 'monitor', 'both']).default('monitor'), // voicebot=active agent, monitor=passive listener
  SIP_PORT: z.coerce.number().int().positive().default(5060),
  SIP_DOMAIN: z.string().default('204671.tenios.com'),
  SIP_USERNAME: z.string().optional(),
  SIP_PASSWORD: z.string().optional(),
  SIP_PUBLIC_IP: z.string().optional(), // Optional: Override detected public IP
  SIP_SKIP_REGISTRATION: z.coerce.boolean().default(false), // For peer-to-peer testing

  // ===== RTP Configuration =====
  RTP_PORT_MIN: z.coerce.number().int().positive().default(10000),
  RTP_PORT_MAX: z.coerce.number().int().positive().default(20000),

  // ===== Voice Pipeline Configuration =====
  VAD_SILENCE_THRESHOLD_DB: z.coerce.number().default(-40),
  VAD_SILENCE_DURATION_MS: z.coerce.number().int().positive().default(500),
  VAD_MIN_UTTERANCE_MS: z.coerce.number().int().positive().default(300),
  VAD_MAX_UTTERANCE_MS: z.coerce.number().int().positive().optional(), // Optional: Max utterance duration

  // ===== Denoiser Configuration =====
  DENOISER_RNNOISE_ENABLED: z.coerce.boolean().default(false),
  DENOISER_RNNOISE_QUALITY: z.enum(['low', 'medium', 'high']).default('medium'),
  DENOISER_DTLN_ENABLED: z.coerce.boolean().default(false),
  DENOISER_DTLN_QUALITY: z.enum(['low', 'medium', 'high']).default('medium'),
  DEFAULT_DENOISER_PROVIDER: z.string().default('none') // 'none' = disabled, 'rnnoise', 'dtln'
});

// Parse and validate environment variables
const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('❌ Environment validation failed:');
  parsed.error.issues.forEach((issue) => {
    console.error(`  - ${issue.path.join('.')}: ${issue.message}`);
  });
  process.exit(1);
}

export const env = parsed.data;

// Additional validation: Provider-specific requirements
if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) {
  console.error('❌ OPENAI_API_KEY is required when AI_PROVIDER=openai');
  process.exit(1);
}

if (env.AI_PROVIDER === 'local-llm') {
  if (!env.LOCAL_LLM_URL) {
    console.error('❌ LOCAL_LLM_URL is required when AI_PROVIDER=local-llm');
    process.exit(1);
  }
  if (!env.WHISPER_URL) {
    console.warn('⚠️  WHISPER_URL not set. STT functionality may not work.');
  }
  if (!env.TTS_URL) {
    console.warn('⚠️  TTS_URL not set. Voice synthesis may not work.');
  }
}

// Log configuration (non-sensitive info only)
console.log('✅ Environment configuration loaded:');
console.log(`   - AI Provider: ${env.AI_PROVIDER}`);
console.log(`   - Server Port: ${env.PORT}`);
console.log(`   - WebSocket Port: ${env.WS_PORT}`);
console.log(`   - Node Environment: ${env.NODE_ENV}`);
console.log(`   - Workshop Data: ${env.WORKSHOP_DATA_DIR}`);
if (env.SIP_ENABLED) {
  console.log(`   - SIP Server: enabled on port ${env.SIP_PORT}`);
  console.log(`   - SIP Mode: ${env.SIP_MODE}`);
  console.log(`   - SIP Domain: ${env.SIP_DOMAIN}`);
  console.log(`   - SIP Username: ${env.SIP_USERNAME || '(not set)'}`);
}
