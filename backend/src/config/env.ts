import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  PUBLIC_URL: z.string().min(1, 'PUBLIC_URL is required (e.g., https://cd084bdb3032.ngrok-free.app)'),
  MAX_CONCURRENT_CALLS: z.string().default('10'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  TENIOS_API_KEY: z.string().min(1, 'TENIOS_API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CSV_LOCK_TIMEOUT: z.string().default('5000'),
  CUSTOMERS_CSV_PATH: z.string().default('./data/customers.csv'),
  READINGS_CSV_PATH: z.string().default('./data/meter-readings.csv'),
  TRANSCRIPTIONS_CSV_PATH: z.string().default('./data/transcriptions.csv'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  AGENT_SIP_URI: z.string().min(1, 'AGENT_SIP_URI is required'),
  TRANSCRIPTION_SIP_URI: z.string().min(1, 'TRANSCRIPTION_SIP_URI is required'),
  TRANSCRIPTION_PHONE_NUMBER: z.string().min(1, 'TRANSCRIPTION_PHONE_NUMBER is required'),
  SUPERVISOR_KEY: z.string().min(1, 'SUPERVISOR_KEY is required'),
  LINPHONE_RECORDINGS_DIR: z.string().default('./linphone-recordings'),
  SIMULATE_HUMAN_AGENT: z.string().default('false'),
  AI_AGENT_SYSTEM_PROMPT: z.string().default('Du bist ein freundlicher Mitarbeiter beim Stadtwerk. Du hilfst Kunden bei allen Anliegen, insbesondere bei der Erfassung von Zählerständen, Fragen zu Rechnungen, Tarifwechseln und allgemeinen Stadtwerk-Themen. Sei höflich, empathisch und hilfsbereit.'),
  FORCE_AGENT_BRIDGE: z.string().default('false')
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation failed:', parsed.error.format());
  process.exit(1);
}

export const env = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: parseInt(parsed.data.PORT, 10),
  PUBLIC_URL: parsed.data.PUBLIC_URL,
  MAX_CONCURRENT_CALLS: parseInt(parsed.data.MAX_CONCURRENT_CALLS, 10),
  OPENAI_API_KEY: parsed.data.OPENAI_API_KEY,
  TENIOS_API_KEY: parsed.data.TENIOS_API_KEY,
  JWT_SECRET: parsed.data.JWT_SECRET,
  CSV_LOCK_TIMEOUT: parseInt(parsed.data.CSV_LOCK_TIMEOUT, 10),
  CUSTOMERS_CSV_PATH: parsed.data.CUSTOMERS_CSV_PATH,
  READINGS_CSV_PATH: parsed.data.READINGS_CSV_PATH,
  TRANSCRIPTIONS_CSV_PATH: parsed.data.TRANSCRIPTIONS_CSV_PATH,
  LOG_LEVEL: parsed.data.LOG_LEVEL,
  AGENT_SIP_URI: parsed.data.AGENT_SIP_URI,
  TRANSCRIPTION_SIP_URI: parsed.data.TRANSCRIPTION_SIP_URI,
  TRANSCRIPTION_PHONE_NUMBER: parsed.data.TRANSCRIPTION_PHONE_NUMBER,
  SUPERVISOR_KEY: parsed.data.SUPERVISOR_KEY,
  LINPHONE_RECORDINGS_DIR: parsed.data.LINPHONE_RECORDINGS_DIR,
  SIMULATE_HUMAN_AGENT: parsed.data.SIMULATE_HUMAN_AGENT.toLowerCase() === 'true',
  AI_AGENT_SYSTEM_PROMPT: parsed.data.AI_AGENT_SYSTEM_PROMPT,
  FORCE_AGENT_BRIDGE: parsed.data.FORCE_AGENT_BRIDGE.toLowerCase() === 'true'
};
