import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().default('3000'),
  MAX_CONCURRENT_CALLS: z.string().default('10'),
  OPENAI_API_KEY: z.string().min(1, 'OPENAI_API_KEY is required'),
  TENIOS_API_KEY: z.string().min(1, 'TENIOS_API_KEY is required'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  CSV_LOCK_TIMEOUT: z.string().default('5000'),
  CUSTOMERS_CSV_PATH: z.string().default('./data/customers.csv'),
  READINGS_CSV_PATH: z.string().default('./data/meter-readings.csv'),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info')
});

const parsed = EnvSchema.safeParse(process.env);

if (!parsed.success) {
  console.error('Environment validation failed:', parsed.error.format());
  process.exit(1);
}

export const env = {
  NODE_ENV: parsed.data.NODE_ENV,
  PORT: parseInt(parsed.data.PORT, 10),
  MAX_CONCURRENT_CALLS: parseInt(parsed.data.MAX_CONCURRENT_CALLS, 10),
  OPENAI_API_KEY: parsed.data.OPENAI_API_KEY,
  TENIOS_API_KEY: parsed.data.TENIOS_API_KEY,
  JWT_SECRET: parsed.data.JWT_SECRET,
  CSV_LOCK_TIMEOUT: parseInt(parsed.data.CSV_LOCK_TIMEOUT, 10),
  CUSTOMERS_CSV_PATH: parsed.data.CUSTOMERS_CSV_PATH,
  READINGS_CSV_PATH: parsed.data.READINGS_CSV_PATH,
  LOG_LEVEL: parsed.data.LOG_LEVEL
};
