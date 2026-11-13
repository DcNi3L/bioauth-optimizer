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
  /** Пакетный режим: предельный размер zip-архива и время обработки набора bio-engine. */
  BATCH_MAX_BYTES: z.coerce
    .number()
    .int()
    .positive()
    .default(256 * 1024 * 1024),
  BATCH_TIMEOUT_MS: z.coerce
    .number()
    .int()
    .positive()
    .default(30 * 60 * 1000),
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
  /** Сколько секунд после проверки второго фактора разрешены опасные действия без повторного подтверждения (#41). */
  /** Токен для GET /metrics (Prometheus); без него метрики открыты только вне production. */
  METRICS_TOKEN: z.preprocess((v) => (v === '' ? undefined : v), z.string().min(16).optional()),
  STEP_UP_MAX_AGE_SEC: z.coerce.number().int().min(30).max(3600).default(300),
  AUTH_RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(30),
  PASSKEY_DECLARED_FAR: z.coerce.number().gt(0).lt(1).default(2e-5),
  DRIFT_CHECK_HOURS: z.coerce.number().min(0).default(24),
  DRIFT_WINDOW_DAYS: z.coerce.number().positive().default(7),
  CROSS_IMPOSTOR_LIMIT: z.coerce.number().int().min(0).max(500).default(50),
  /** OpenID Connect: идентификатор издателя (по умолчанию — адрес интерфейса RP_ORIGIN). */
  OIDC_ISSUER: z.url().optional(),
  OIDC_ACCESS_TOKEN_TTL_S: z.coerce.number().int().min(60).max(86_400).default(600),
  OIDC_REFRESH_TOKEN_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
  /** Создать демо-клиента bioauth-demo (страница /oauth/demo) при старте. */
  OIDC_DEMO_CLIENT: booleanFlag.default(true),
  /** Динамическая регистрация клиентов (RFC 7591, #47): POST /oidc/register с начальным токеном администратора. */
  OIDC_DYNAMIC_REGISTRATION: booleanFlag.default(false),
  /** Разрешённые хосты адресов возврата для самостоятельной регистрации (через запятую); пусто — любые https. */
  OIDC_REGISTRATION_ALLOWED_HOSTS: z
    .string()
    .default('')
    .transform((v) =>
      v
        .split(',')
        .map((h) => h.trim().toLowerCase())
        .filter(Boolean),
    ),
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
