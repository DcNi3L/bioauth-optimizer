import { z } from '@bioauth/contracts';

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL обязательна' }),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(500).default(50),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
});

export type AppConfig = z.infer<typeof envSchema>;
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Конфигурация валидируется при старте: без DATABASE_URL процесс завершается с понятной ошибкой. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Некорректные переменные окружения:\n${z.prettifyError(parsed.error)}`);
  }
  return parsed.data;
}
