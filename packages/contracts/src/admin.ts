import { z } from 'zod';

import { loginEventSchema, loginSchema, roleSchema, userSessionSchema } from './identity';

/** v3: админ-панель — пользователи, сессии, сводка. */

export const adminUserSchema = z.object({
  id: z.uuid(),
  login: z.string(),
  displayName: z.string(),
  role: roleSchema,
  email: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  lockedUntil: z.string().nullable(),
  disabled: z.boolean(),
  face: z.boolean(),
  passkeys: z.number().int(),
  consent: z.boolean(),
  activeSessions: z.number().int(),
  avatarUrl: z.string().nullable(),
});
export type AdminUserDto = z.infer<typeof adminUserSchema>;

export const adminUsersPageSchema = z.object({
  items: z.array(adminUserSchema),
  total: z.number().int(),
});
export type AdminUsersPageDto = z.infer<typeof adminUsersPageSchema>;

export const adminUserDetailSchema = z.object({
  user: adminUserSchema,
  sessions: z.array(userSessionSchema.omit({ current: true })),
  history: z.array(loginEventSchema),
  apps: z.array(
    z.object({ clientId: z.string(), name: z.string(), scopes: z.array(z.string()), grantedAt: z.string() }),
  ),
});
export type AdminUserDetailDto = z.infer<typeof adminUserDetailSchema>;

export const adminUpdateUserSchema = z.strictObject({
  role: roleSchema.optional(),
  disabled: z.boolean().optional(),
  unlock: z.literal(true).optional(),
  displayName: z.string().trim().min(1).max(200).optional(),
});
export type AdminUpdateUser = z.infer<typeof adminUpdateUserSchema>;

export const adminCreateUserSchema = z.strictObject({
  login: loginSchema,
  displayName: z.string().trim().min(1).max(200),
  role: z.enum(['admin', 'researcher', 'auditor']),
  password: z.string().min(12, { error: 'пароль не короче 12 символов' }).max(200),
  email: z.email().max(254).nullable().default(null),
});
export type AdminCreateUser = z.input<typeof adminCreateUserSchema>;

const dayPoint = z.object({ day: z.string(), success: z.number().int(), failure: z.number().int() });

export const adminStatsSchema = z.object({
  users: z.object({
    total: z.number().int(),
    byRole: z.record(z.string(), z.number().int()),
    withFace: z.number().int(),
    withPasskey: z.number().int(),
    locked: z.number().int(),
    disabled: z.number().int(),
  }),
  sessions: z.object({ active: z.number().int(), activeUsers: z.number().int() }),
  logins: z.object({
    last24h: z.object({ success: z.number().int(), failure: z.number().int() }),
    byDay: z.array(dayPoint),
    byMethod: z.record(z.string(), z.number().int()),
    topReasons: z.array(z.object({ reason: z.string(), n: z.number().int() })),
  }),
  oauth: z.object({ clients: z.number().int(), activeGrants: z.number().int() }),
});
export type AdminStatsDto = z.infer<typeof adminStatsSchema>;

export const adminLoginEventSchema = loginEventSchema.extend({
  userId: z.uuid(),
  login: z.string(),
});
export type AdminLoginEventDto = z.infer<typeof adminLoginEventSchema>;
