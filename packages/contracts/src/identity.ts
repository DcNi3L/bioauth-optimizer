import { z } from 'zod';

import { faceIssueSchema, livenessCommandSchema } from './bio-engine';
import { costsSchema, finite } from './common';

/** v2: пользователи, согласие, регистрация биометрии и вход по политике (docs/10 §10.4). */

export const roleSchema = z.enum(['subject', 'admin', 'researcher', 'auditor']);
export type Role = z.infer<typeof roleSchema>;

export const loginSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{2,63}$/, {
    error: 'логин: 3–64 символа, латинские буквы, цифры, точка, дефис, подчёркивание',
  });

export const registerSubjectRequestSchema = z.strictObject({
  login: loginSchema,
  displayName: z.string().trim().min(1, { error: 'укажите имя' }).max(200),
});
export type RegisterSubjectRequest = z.infer<typeof registerSubjectRequestSchema>;

export const passwordLoginRequestSchema = z.strictObject({
  login: loginSchema,
  password: z.string().min(1).max(256),
});

export const meSchema = z.object({
  id: z.uuid(),
  login: z.string(),
  displayName: z.string(),
  role: roleSchema,
  mfaComplete: z.boolean(),
  consent: z.object({ textVersion: z.string(), grantedAt: z.string() }).nullable(),
  face: z.object({ modelVersion: z.string(), samples: z.number().int(), updatedAt: z.string() }).nullable(),
  passkeys: z.number().int(),
  email: z.string().nullable(),
  createdAt: z.string(),
  lastLoginAt: z.string().nullable(),
  avatarUrl: z.string().nullable(),
  /** Способы проверки текущей сессии (RFC 8176): face, hwk (passkey), pwd, mfa. */
  amr: z.array(z.string()),
});
export type MeDto = z.infer<typeof meSchema>;

/** Ответ для интерфейса: пользователь или null, если вход не выполнен (без ошибки 401). */
export const viewerSchema = z.object({ user: meSchema.nullable() });
export type ViewerDto = z.infer<typeof viewerSchema>;

export const consentTextSchema = z.object({ version: z.string(), title: z.string(), text: z.string() });
export type ConsentTextDto = z.infer<typeof consentTextSchema>;

export const grantConsentRequestSchema = z.strictObject({
  textVersion: z.string().min(1),
  accepted: z.literal(true, { error: 'нужно явно подтвердить согласие' }),
});

/** Кадр с камеры: JPEG в base64 (с префиксом data: или без) и время съёмки в мс. */
export const captureFrameSchema = z.strictObject({
  image: z.string().min(100).max(3_000_000, { error: 'кадр слишком большой' }),
  ts: z.number().int().nonnegative(),
});
export type CaptureFrame = z.infer<typeof captureFrameSchema>;

export const enrollFaceRequestSchema = z.strictObject({
  frames: z.array(captureFrameSchema).min(3, { error: 'нужно не менее 3 кадров' }).max(10),
});
export type EnrollFaceRequest = z.infer<typeof enrollFaceRequestSchema>;

export const enrollFaceResponseSchema = z.object({
  enrolled: z.literal(true),
  framesUsed: z.number().int(),
  modelVersion: z.string(),
  livenessPassed: z.boolean(),
});

// ── Политика входа ──

export const faceStepSchema = z.strictObject({
  factor: z.literal('face'),
  tauFace: finite('τ_face').min(-1).max(1),
  tauPad: finite('τ_pad').min(0).max(1),
  /** Число случайных команд; правила АРРФР требуют не менее трёх. */
  commands: z.number().int().min(0).max(4),
  calibrated: z.boolean(),
});
export const passkeyStepSchema = z.strictObject({ factor: z.literal('passkey') });
export const policyStepSchema = z.discriminatedUnion('factor', [faceStepSchema, passkeyStepSchema]);
export type PolicyStep = z.infer<typeof policyStepSchema>;
export type FaceStep = z.infer<typeof faceStepSchema>;

export const policyStepsSchema = z
  .array(policyStepSchema)
  .min(1)
  .max(2)
  .refine((steps) => new Set(steps.map((s) => s.factor)).size === steps.length, {
    error: 'каждый фактор — не более одного раза',
  });

export const policyStatusSchema = z.enum(['proposed', 'active', 'retired', 'rejected']);

export const authPolicySchema = z.object({
  id: z.uuid(),
  version: z.number().int(),
  steps: policyStepsSchema,
  costs: costsSchema,
  rationale: z.string().nullable(),
  experimentId: z.uuid().nullable(),
  status: policyStatusSchema,
  proposedBy: z.string().nullable(),
  decidedBy: z.string().nullable(),
  decidedAt: z.string().nullable(),
  decisionNote: z.string().nullable(),
  createdAt: z.string(),
});
export type AuthPolicyDto = z.infer<typeof authPolicySchema>;

// ── Вход по политике ──

export const startAuthRequestSchema = z.strictObject({ login: loginSchema });

export const authStepSchema = z.discriminatedUnion('factor', [
  z.object({ factor: z.literal('face'), commands: z.array(livenessCommandSchema) }),
  z.object({ factor: z.literal('passkey') }),
]);
export type AuthStepDto = z.infer<typeof authStepSchema>;

export const authSessionSchema = z.object({
  sessionId: z.uuid(),
  expiresAt: z.string(),
  steps: z.array(authStepSchema),
  currentStep: z.number().int(),
  attemptsLeft: z.number().int(),
  policyVersion: z.number().int(),
  calibrated: z.boolean(),
});
export type AuthSessionDto = z.infer<typeof authSessionSchema>;

export const submitFaceRequestSchema = z.strictObject({
  baseline: z.array(captureFrameSchema).min(1).max(4),
  steps: z
    .array(
      z.strictObject({ command: livenessCommandSchema, frames: z.array(captureFrameSchema).min(1).max(5) }),
    )
    .max(4),
});
export type SubmitFaceRequest = z.infer<typeof submitFaceRequestSchema>;

// ── Живые подсказки позы (кадр низкого разрешения, решение не принимается) ──

export const posePreviewRequestSchema = z.strictObject({
  image: z.string().min(100).max(600_000),
  width: z.number().int().min(32).max(1920),
  height: z.number().int().min(32).max(1920),
});
export type PosePreviewRequest = z.infer<typeof posePreviewRequestSchema>;

export const posePreviewSchema = z.object({
  face: z.boolean(),
  issues: z.array(faceIssueSchema),
  /** Рамка лица в долях кадра: x, y, ширина, высота (кадр не зеркальный). */
  box: z.tuple([z.number(), z.number(), z.number(), z.number()]).nullable(),
  yawRatio: z.number().nullable(),
  pitchRatio: z.number().nullable(),
  /** Наклон головы к плечу, °: > 0 — к левому плечу человека. */
  rollDeg: z.number().nullable(),
  interocularPx: z.number().nullable(),
});
export type PosePreviewDto = z.infer<typeof posePreviewSchema>;

/**
 * Пороги активных команд для подсказок в интерфейсе — те же, что проверяет bio-engine
 * (services/bio-engine/app/config.py, LivenessThresholds). Окончательное решение принимает сервер.
 */
export const LIVENESS_GUIDE = {
  yawDelta: 0.1,
  pitchFactor: 0.88,
  pitchDownFactor: 1.14,
  closerFactor: 1.18,
  awayFactor: 0.85,
  rollDeltaDeg: 10,
} as const;

export const authRejectReasonSchema = z.enum([
  'FACE_QUALITY',
  'NO_MATCH',
  'LIVENESS_PASSIVE',
  'LIVENESS_COMMANDS',
  'IDENTITY_SWITCH',
  'PASSKEY_FAILED',
  'SESSION_EXPIRED',
  'LOCKED',
]);
export type AuthRejectReason = z.infer<typeof authRejectReasonSchema>;

export const authStepResultSchema = z.object({
  outcome: z.enum(['continue', 'accepted', 'retry', 'rejected', 'locked']),
  reason: authRejectReasonSchema.nullable(),
  message: z.string(),
  attemptsLeft: z.number().int(),
  currentStep: z.number().int(),
  lockedUntil: z.string().nullable(),
  /** Новый набор команд для повторной попытки (команды не повторяются между попытками). */
  commands: z.array(livenessCommandSchema).nullable(),
});
export type AuthStepResultDto = z.infer<typeof authStepResultSchema>;

export const webauthnResponseSchema = z.looseObject({ id: z.string(), type: z.literal('public-key') });

// ── Журнал аудита (только чтение: admin, auditor) ──

export const auditEventSchema = z.object({
  seq: z.number().int(),
  at: z.string(),
  actorId: z.string().nullable(),
  action: z.string(),
  target: z.string().nullable(),
  details: z.record(z.string(), z.unknown()),
  hash: z.string(),
});
export type AuditEventDto = z.infer<typeof auditEventSchema>;

export const chainVerificationSchema = z.object({
  ok: z.boolean(),
  events: z.number().int(),
  brokenAt: z.number().int().nullable(),
});
export type ChainVerificationDto = z.infer<typeof chainVerificationSchema>;

// ── Учётная запись: профиль, сессии и устройства, история входов, аватар ──

export const updateProfileSchema = z.strictObject({
  displayName: z.string().trim().min(1).max(200).optional(),
  email: z.email({ error: 'некорректный адрес почты' }).max(254).nullable().optional(),
});
export type UpdateProfileRequest = z.infer<typeof updateProfileSchema>;

export const avatarUploadSchema = z.strictObject({
  /** data:image/png|jpeg|webp;base64,… не больше 1 МБ после декодирования. */
  image: z
    .string()
    .regex(/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/, {
      error: 'ожидается изображение PNG, JPEG или WebP',
    })
    .max(1_450_000),
});

export const deviceSchema = z.object({
  browser: z.string().nullable(),
  os: z.string().nullable(),
  type: z.enum(['desktop', 'mobile', 'tablet', 'unknown']),
});
export type DeviceDto = z.infer<typeof deviceSchema>;

export const userSessionSchema = z.object({
  id: z.uuid(),
  current: z.boolean(),
  createdAt: z.string(),
  lastSeenAt: z.string(),
  expiresAt: z.string(),
  ip: z.string().nullable(),
  device: deviceSchema,
  amr: z.array(z.string()),
  mfa: z.boolean(),
});
export type UserSessionDto = z.infer<typeof userSessionSchema>;

export const loginMethodSchema = z.enum(['register', 'password', 'face', 'passkey', 'oidc']);

export const loginEventSchema = z.object({
  id: z.uuid(),
  at: z.string(),
  success: z.boolean(),
  method: loginMethodSchema,
  amr: z.array(z.string()),
  reason: z.string().nullable(),
  ip: z.string().nullable(),
  device: deviceSchema,
  clientId: z.string().nullable(),
});
export type LoginEventDto = z.infer<typeof loginEventSchema>;
