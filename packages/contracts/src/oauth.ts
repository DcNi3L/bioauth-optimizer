import { z } from 'zod';

/** v3: сервер авторизации OpenID Connect — клиенты, согласие, подключённые приложения. */

export const OIDC_SCOPES = ['openid', 'profile', 'email', 'roles', 'offline_access', 'biometrics'] as const;
export const oidcScopeSchema = z.enum(OIDC_SCOPES);
export type OidcScope = z.infer<typeof oidcScopeSchema>;

export const grantTypeSchema = z.enum(['authorization_code', 'refresh_token', 'client_credentials']);

const redirectUri = z
  .url({ error: 'некорректный адрес возврата' })
  .refine((u) => !u.includes('#'), { error: 'адрес возврата без фрагмента (#)' })
  .refine((u) => u.startsWith('https://') || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//.test(u), {
    error: 'адрес возврата — https, а http только для localhost',
  });

export const oauthClientSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  type: z.enum(['public', 'confidential']),
  redirectUris: z.array(z.string()),
  postLogoutRedirectUris: z.array(z.string()),
  grantTypes: z.array(grantTypeSchema),
  scopes: z.array(z.string()),
  firstParty: z.boolean(),
  disabled: z.boolean(),
  /** Зарегистрирован сам (RFC 7591) и ждёт проверки: включает администратор. */
  pendingReview: z.boolean(),
  createdAt: z.string(),
  activeGrants: z.number().int(),
});
export type OauthClientDto = z.infer<typeof oauthClientSchema>;

export const createOauthClientSchema = z.strictObject({
  clientId: z
    .string()
    .regex(/^[A-Za-z0-9._-]{3,64}$/, { error: 'идентификатор: 3–64 символа A–Z, a–z, 0–9, «.», «_», «-»' }),
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).nullable().default(null),
  type: z.enum(['public', 'confidential']),
  redirectUris: z.array(redirectUri).max(10).default([]),
  postLogoutRedirectUris: z.array(redirectUri).max(10).default([]),
  grantTypes: z.array(grantTypeSchema).min(1),
  scopes: z.array(oidcScopeSchema).min(1),
  firstParty: z.boolean().default(false),
});
export type CreateOauthClient = z.input<typeof createOauthClientSchema>;

// Без значений по умолчанию: .partial() их сохраняет, и PATCH без поля стирал бы адреса возврата, описание и firstParty.
export const updateOauthClientSchema = z
  .strictObject({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).nullable(),
    redirectUris: z.array(redirectUri).max(10),
    postLogoutRedirectUris: z.array(redirectUri).max(10),
    grantTypes: z.array(grantTypeSchema).min(1),
    scopes: z.array(oidcScopeSchema).min(1),
    firstParty: z.boolean(),
    disabled: z.boolean(),
    rotateSecret: z.literal(true),
  })
  .partial();
export type UpdateOauthClient = z.input<typeof updateOauthClientSchema>;

export const oauthClientCreatedSchema = z.object({
  client: oauthClientSchema,
  /** Показывается один раз: в БД хранится только хэш. */
  clientSecret: z.string().nullable(),
});

export const oauthRequestInfoSchema = z.object({
  id: z.uuid(),
  client: z.object({
    clientId: z.string(),
    name: z.string(),
    description: z.string().nullable(),
    firstParty: z.boolean(),
  }),
  scopes: z.array(z.string()),
  redirectHost: z.string(),
  user: z.object({ login: z.string(), displayName: z.string() }).nullable(),
});
export type OauthRequestInfoDto = z.infer<typeof oauthRequestInfoSchema>;

export const oauthDecisionSchema = z.strictObject({ approve: z.boolean() });
export const oauthRedirectSchema = z.object({ redirectTo: z.string() });

export const connectedAppSchema = z.object({
  clientId: z.string(),
  name: z.string(),
  scopes: z.array(z.string()),
  grantedAt: z.string(),
  lastUsedAt: z.string().nullable(),
});
export type ConnectedAppDto = z.infer<typeof connectedAppSchema>;

/** Подтверждение выхода по запросу приложения (RP-Initiated Logout без id_token_hint). */
export const oauthLogoutRequestSchema = z.strictObject({
  clientId: z.string().max(64).optional(),
  postLogoutRedirectUri: z.string().max(2000).optional(),
  state: z.string().max(500).optional(),
});
export type OauthLogoutRequest = z.infer<typeof oauthLogoutRequestSchema>;
export const oauthLogoutInfoSchema = z.object({ clientName: z.string().nullable() });

// ── v3.3 (#47): динамическая регистрация клиентов (RFC 7591) ──

export const createInitialTokenSchema = z.strictObject({
  note: z.string().trim().max(200).nullable().default(null),
  /** Сколько клиентов можно зарегистрировать этим токеном. */
  uses: z.int().min(1).max(100).default(1),
  ttlHours: z
    .int()
    .min(1)
    .max(24 * 30)
    .default(24),
});

export const initialTokenSchema = z.object({
  id: z.uuid(),
  note: z.string().nullable(),
  usesLeft: z.number().int(),
  expiresAt: z.string(),
  createdAt: z.string(),
});
export type InitialTokenDto = z.infer<typeof initialTokenSchema>;

export const initialTokenCreatedSchema = initialTokenSchema.extend({
  /** Показывается один раз; в базе — только sha256. */
  token: z.string(),
});
export type InitialTokenCreatedDto = z.infer<typeof initialTokenCreatedSchema>;
