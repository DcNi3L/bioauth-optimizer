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

export const updateOauthClientSchema = createOauthClientSchema
  .omit({ clientId: true, type: true })
  .partial()
  .extend({ disabled: z.boolean().optional(), rotateSecret: z.literal(true).optional() })
  .strict();
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
