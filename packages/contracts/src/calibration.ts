import { z } from 'zod';

import { factorCatalogSchema } from './catalogs';
import { costsSchema, farMaxSchema } from './common';
import { factorSchema } from './factor-selection';
import { thresholdOptimizeResponseSchema } from './threshold';

/** v2.2: замкнутый контур калибровки (docs/10 §10.7), испытание PAD (§10.11), дрейф, журнал попыток. */

export const calibrationModalitySchema = z.enum(['face', 'pad']);
export type CalibrationModality = z.infer<typeof calibrationModalitySchema>;

const isoDate = z.iso.datetime({ offset: true });

export const calibrationDataSchema = z.object({
  modality: z.enum(['face', 'fingerprint', 'pad']),
  modelVersion: z.string(),
  positives: z.number().int(),
  negatives: z.number().int(),
  bySource: z.record(z.string(), z.number().int()),
  firstAt: z.string().nullable(),
  lastAt: z.string().nullable(),
});
export type CalibrationDataDto = z.infer<typeof calibrationDataSchema>;

export const driftAlertSchema = z.object({
  id: z.uuid(),
  policyVersion: z.number().int(),
  modelVersion: z.string(),
  windowStart: z.string(),
  windowEnd: z.string(),
  baselineFrr: z.number(),
  recentFrr: z.number(),
  samples: z.number().int(),
  zScore: z.number(),
  acknowledged: z.boolean(),
  createdAt: z.string(),
});
export type DriftAlertDto = z.infer<typeof driftAlertSchema>;

export const calibrationOverviewSchema = z.object({
  data: z.array(calibrationDataSchema),
  activePolicy: z.object({
    id: z.uuid(),
    version: z.number().int(),
    tauFace: z.number().nullable(),
    tauPad: z.number().nullable(),
    calibrated: z.boolean(),
    costs: costsSchema,
  }),
  drift: z.array(driftAlertSchema),
});
export type CalibrationOverviewDto = z.infer<typeof calibrationOverviewSchema>;

export const calibrateRequestSchema = z.strictObject({
  modality: calibrationModalitySchema,
  modelVersion: z.string().min(1),
  from: isoDate.nullable().default(null),
  to: isoDate.nullable().default(null),
  /** По умолчанию — стоимости активной политики. */
  costs: costsSchema.nullable().default(null),
  farMax: farMaxSchema.default(null),
  /** FAR, который нужно подтвердить данными (правило трёх). */
  targetFar: z.number().gt(0).lt(1).default(1e-3),
});
export type CalibrateRequest = z.input<typeof calibrateRequestSchema>;

const operatingPoint = z.object({ tau: z.number(), far: z.number(), frr: z.number(), cost: z.number() });

export const calibrateResponseSchema = z.object({
  modality: calibrationModalitySchema,
  modelVersion: z.string(),
  datasetId: z.uuid(),
  threshold: thresholdOptimizeResponseSchema,
  /** Текущий порог активной политики на тех же данных — для сравнения «до/после». */
  current: operatingPoint.nullable(),
  sufficiency: z.object({
    positives: z.number().int(),
    negatives: z.number().int(),
    falseAccepts: z.number().int(),
    /** Верхняя 95%-граница FAR при τ*: правило трёх (3/n) без ложных допусков, иначе граница Уилсона. */
    confirmedFar: z.number(),
    targetFar: z.number(),
    enough: z.boolean(),
    message: z.string(),
  }),
});
export type CalibrateResponseDto = z.infer<typeof calibrateResponseSchema>;

export const proposeFromCalibrationSchema = z
  .strictObject({
    faceExperimentId: z.uuid().nullable().default(null),
    padExperimentId: z.uuid().nullable().default(null),
    rationale: z.string().trim().max(2000).nullable().default(null),
  })
  .refine((v) => v.faceExperimentId !== null || v.padExperimentId !== null, {
    error: 'нужен хотя бы один эксперимент калибровки',
  });

export const measuredFactorSchema = factorSchema.extend({
  attempts: z.number().int(),
  frrInterval: z.tuple([z.number(), z.number()]),
  latencyP95Ms: z.number().nullable(),
  sources: z.object({
    far: z.enum(['measured', 'declared']),
    frr: z.literal('measured'),
    latency: z.literal('measured'),
  }),
  confirmedFar: z.number().nullable(),
});
export type MeasuredFactorDto = z.infer<typeof measuredFactorSchema>;

export const measuredFactorsSchema = z.object({
  from: z.string().nullable(),
  to: z.string().nullable(),
  factors: z.array(measuredFactorSchema),
  warnings: z.array(z.string()),
});
export type MeasuredFactorsDto = z.infer<typeof measuredFactorsSchema>;

export const createMeasuredCatalogSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).nullable().default(null),
  from: isoDate.nullable().default(null),
  to: isoDate.nullable().default(null),
  costs: z.record(z.string(), z.number().min(0)).default({}),
});
export const measuredCatalogResponseSchema = factorCatalogSchema;

// ── Испытание PAD (UC-8, ISO/IEC 30107-3) ──

export const attackTypeSchema = z.enum(['print', 'screen', 'video', 'mask', 'other']);
export type AttackType = z.infer<typeof attackTypeSchema>;

export const padSampleRequestSchema = z.strictObject({
  label: z.discriminatedUnion('kind', [
    z.strictObject({ kind: z.literal('bonafide') }),
    z.strictObject({ kind: z.literal('attack'), attackType: attackTypeSchema }),
  ]),
  frames: z
    .array(z.strictObject({ image: z.string().min(100).max(3_000_000), ts: z.number().int().nonnegative() }))
    .min(1)
    .max(8),
});
export type PadSampleRequest = z.infer<typeof padSampleRequestSchema>;

export const padSampleResponseSchema = z.object({
  pLive: z.number(),
  padVersion: z.string(),
  detectedAsLive: z.boolean(),
});

const rate = z.object({
  errors: z.number().int(),
  total: z.number().int(),
  rate: z.number().nullable(),
  interval: z.tuple([z.number(), z.number()]).nullable(),
});

export const padReportSchema = z.object({
  padVersion: z.string().nullable(),
  threshold: z.number(),
  bpcer: rate,
  apcer: z.array(rate.extend({ attackType: attackTypeSchema })),
  /** APCER худшего вида атаки — основная метрика ISO/IEC 30107-3. */
  apcerMax: z.number().nullable(),
  versions: z.array(z.string()),
});
export type PadReportDto = z.infer<typeof padReportSchema>;

// ── Журнал попыток ──

export const attemptSchema = z.object({
  id: z.uuid(),
  at: z.string(),
  login: z.string().nullable(),
  factor: z.enum(['face', 'passkey']),
  outcome: z.enum(['accept', 'reject', 'error', 'cancel']),
  reason: z.string().nullable(),
  /** Оценки скрыты для роли «аудитор» (минимизация данных). */
  score: z.number().nullable(),
  liveness: z.number().nullable(),
  challengesOk: z.boolean().nullable(),
  durationMs: z.number().int(),
  policyVersion: z.number().int().nullable(),
});
export type AttemptDto = z.infer<typeof attemptSchema>;

export const attemptStatsSchema = z.object({
  factor: z.enum(['face', 'passkey']),
  total: z.number().int(),
  accepted: z.number().int(),
  rejected: z.number().int(),
  errors: z.number().int(),
  cancelled: z.number().int(),
  p50Ms: z.number().nullable(),
  p95Ms: z.number().nullable(),
  byReason: z.record(z.string(), z.number().int()),
});

export const attemptsPageSchema = z.object({
  items: z.array(attemptSchema),
  stats: z.array(attemptStatsSchema),
  nextCursor: z.string().nullable(),
});
export type AttemptsPageDto = z.infer<typeof attemptsPageSchema>;

// ── Пакетный режим (UC-9): набор изображений → набор оценок v1 ──

export const batchJobStateSchema = z.enum(['running', 'done', 'failed', 'cancelled']);

export const batchJobSchema = z.object({
  id: z.uuid(),
  state: batchJobStateSchema,
  stage: z.enum(['scoring', 'saving']).nullable(),
  filename: z.string(),
  name: z.string(),
  seed: z.number().int(),
  maxImpostor: z.number().int(),
  includeInCalibration: z.boolean(),
  startedAt: z.string(),
  finishedAt: z.string().nullable(),
  error: z.string().nullable(),
  result: z
    .object({
      datasetId: z.uuid(),
      modelVersion: z.string(),
      subjects: z.number().int(),
      images: z.number().int(),
      imagesUsed: z.number().int(),
      skipped: z.array(z.object({ file: z.string(), reason: z.string() })),
      skippedTotal: z.number().int(),
      genuineCount: z.number().int(),
      impostorCount: z.number().int(),
      impostorTotal: z.number().int(),
      impostorSampled: z.boolean(),
    })
    .nullable(),
});
export type BatchJobDto = z.infer<typeof batchJobSchema>;

/** Поля формы загрузки архива (multipart, вместе с файлом в поле file). */
export const batchJobRequestSchema = z.object({
  name: z.string().trim().max(200).optional(),
  seed: z.coerce.number().int().min(0).max(4_294_967_295).default(0),
  maxImpostor: z.coerce.number().int().min(1).max(900_000).default(100_000),
  includeInCalibration: z
    .enum(['true', 'false'])
    .default('false')
    .transform((v) => v === 'true'),
});
