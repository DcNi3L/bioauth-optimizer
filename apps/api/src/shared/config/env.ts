import { z } from '@bioauth/contracts';

const booleanFlag = z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1');

/** Ключи шифрования шаблонов: JSON {"key_id": "base64(32 байта)"} (ADR-0014). */
const templateKeysSchema = z.string().transform((raw, ctx) => {
  try {
    const parsed: unknown = JSON.parse(raw);
    const keys = z.record(z.string().min(1), z.string()).parse(parsed);
    const out: Record<string, Buffer> = {};
    for (const [id, b64] of Object.entries(keys)) {
      const key = Buffer.from(b64, 'base64');
      if (key.length !== 32) throw new Error(`ключ ${id}: нужно 32 байта`);
      out[id] = key;
    }
    return out;
  } catch (err) {
    ctx.addIssue({ code: 'custom', message: `TEMPLATE_KEYS: ${(err as Error).message}` });
    return z.NEVER;
  }
});

/** Ключ разработки: используется, только если TEMPLATE_KEYS не задана и NODE_ENV ≠ production. */
const DEV_TEMPLATE_KEYS = JSON.stringify({ dev: Buffer.alloc(32, 7).toString('base64') });

const envSchema = z.object({
  DATABASE_URL: z.string().min(1, { error: 'DATABASE_URL обязательна' }),
  PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  CORS_ORIGIN: z.string().default('http://localhost:3000'),
  MAX_UPLOAD_MB: z.coerce.number().positive().max(500).default(50),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  BIO_ENGINE_URL: z.url().default('http://localhost:8000'),
  BIO_ENGINE_SECRET: z.string().default('dev-bio-secret-change-me'),
  BIO_ENGINE_TIMEOUT_MS: z.coerce.number().int().positive().default(15000),
  TEMPLATE_KEYS: z.preprocess((v) => (v === '' ? undefined : v), templateKeysSchema.optional()),
  TEMPLATE_ACTIVE_KEY: z.string().optional(),
  TEMPLATE_CANCELABLE: booleanFlag.default(true),
  SESSION_TTL_HOURS: z.coerce.number().positive().max(720).default(12),
  COOKIE_SECURE: booleanFlag.optional(),
  RP_ID: z.string().default('localhost'),
  RP_NAME: z.string().default('BioAuth Optimizer'),
  RP_ORIGIN: z.string().default('http://localhost:3000'),
  ADMIN_LOGIN: z.string().default('admin'),
  ADMIN_PASSWORD: z.string().min(12, { error: 'ADMIN_PASSWORD: не короче 12 символов' }).optional(),
  REQUIRE_STAFF_PASSKEY: booleanFlag.default(true),
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  CROSS_IMPOSTOR_LIMIT: z.coerce.number().int().min(0).max(500).default(50),
});

type RawConfig = z.infer<typeof envSchema>;
export type AppConfig = Omit<RawConfig, 'TEMPLATE_KEYS' | 'TEMPLATE_ACTIVE_KEY' | 'COOKIE_SECURE'> & {
  TEMPLATE_KEYS: Record<string, Buffer>;
  TEMPLATE_ACTIVE_KEY: string;
  COOKIE_SECURE: boolean;
};
export const APP_CONFIG = Symbol('APP_CONFIG');

/** Конфигурация валидируется при старте: без DATABASE_URL процесс завершается с понятной ошибкой. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Некорректные переменные окружения:\n${z.prettifyError(parsed.error)}`);
  }
  const cfg = parsed.data;
  const production = cfg.NODE_ENV === 'production';
  if (production && !cfg.TEMPLATE_KEYS && env.ALLOW_DEV_KEYS !== 'true') {
    throw new Error('Некорректные переменные окружения:\nTEMPLATE_KEYS обязательна в production (ADR-0014)');
  }
  const keys = cfg.TEMPLATE_KEYS ?? templateKeysSchema.parse(DEV_TEMPLATE_KEYS);
  const active = cfg.TEMPLATE_ACTIVE_KEY ?? Object.keys(keys)[0]!;
  if (!(active in keys)) {
    throw new Error(
      `Некорректные переменные окружения:\nTEMPLATE_ACTIVE_KEY «${active}» нет в TEMPLATE_KEYS`,
    );
  }
  return {
    ...cfg,
    TEMPLATE_KEYS: keys,
    TEMPLATE_ACTIVE_KEY: active,
    COOKIE_SECURE: cfg.COOKIE_SECURE ?? cfg.RP_ORIGIN.startsWith('https://'),
  };
}
