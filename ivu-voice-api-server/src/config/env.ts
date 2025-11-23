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
  // ===== TENIOS Configuration =====
  TENIOS_API_KEY: z.string().min(1, 'TENIOS_API_KEY is required'),
  TENIOS_WEBHOOK_URL: z.string().url().optional(),

  // ===== AI Provider Configuration =====
  AI_PROVIDER: z.enum(['openai', 'local-llm']).default('openai'),

  // OpenAI (only required when AI_PROVIDER=openai)
  OPENAI_API_KEY: z.string().optional(),

  // Local LLM (only required when AI_PROVIDER=local-llm)
  LOCAL_LLM_URL: z.string().url().optional(),
  WHISPER_URL: z.string().url().optional(),
  TTS_URL: z.string().url().optional(),

  // ===== Server Configuration =====
  PORT: z.coerce.number().int().positive().default(3001),
  WS_PORT: z.coerce.number().int().positive().default(3002),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // ===== Workshop Configuration =====
  WORKSHOP_DATA_DIR: z.string().default('../workshop-data'),
  MAX_CONCURRENT_CALLS: z.coerce.number().int().positive().default(10),

  // ===== Optional Features =====
  ENABLE_CORS: z.coerce.boolean().default(true),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
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
