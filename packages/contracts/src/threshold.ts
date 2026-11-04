import { z } from 'zod';

import { costsSchema, farMaxSchema, finite, metaSchema, normalParamsSchema, uuidSchema } from './common';

export const gaussianModelSchema = z.strictObject({
  kind: z.literal('gaussian'),
  genuine: normalParamsSchema,
  impostor: normalParamsSchema,
});

export const empiricalModelSchema = z.strictObject({
  kind: z.literal('empirical'),
  datasetId: uuidSchema,
});

export const curveRequestSchema = z.strictObject({
  points: z.int().min(10).max(2000).default(200),
  from: finite('curve.from').optional(),
  to: finite('curve.to').optional(),
});

export const thresholdOptimizeRequestSchema = z
  .strictObject({
    model: z.discriminatedUnion('kind', [gaussianModelSchema, empiricalModelSchema]),
    costs: costsSchema,
    constraints: z.strictObject({ farMax: farMaxSchema.default(null) }).default({ farMax: null }),
    curve: curveRequestSchema.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.model.kind === 'gaussian' && !(v.model.genuine.mean > v.model.impostor.mean)) {
      ctx.addIssue({
        code: 'custom',
        path: ['model', 'genuine', 'mean'],
        message: 'среднее законных пользователей должно быть больше среднего злоумышленников',
      });
    }
    const curve = v.curve;
    if (curve?.from !== undefined && curve.to !== undefined && !(curve.to > curve.from)) {
      ctx.addIssue({
        code: 'custom',
        path: ['curve', 'to'],
        message: 'curve.to должно быть больше curve.from',
      });
    }
  });
export type ThresholdOptimizeRequest = z.input<typeof thresholdOptimizeRequestSchema>;
export type ThresholdOptimizeCommand = z.output<typeof thresholdOptimizeRequestSchema>;

const operatingPointSchema = z.object({
  tau: z.number().nullable(),
  far: z.number(),
  frr: z.number(),
  cost: z.number(),
});

export const thresholdOptimizeResponseSchema = z.object({
  experimentId: z.string(),
  method: z.enum(['gaussian-analytic', 'empirical-sweep']),
  eer: operatingPointSchema,
  optimal: operatingPointSchema.extend({
    interval: z.tuple([z.number().nullable(), z.number().nullable()]).nullable(),
    degenerate: z.enum(['acceptAll', 'rejectAll']).nullable(),
    constrainedByFarMax: z.boolean(),
  }),
  lossReduction: z.number().nullable(),
  verification: z.object({
    status: z.enum(['ok', 'mismatch', 'skipped', 'exact']),
    numericTau: z.number().nullable(),
    absDiff: z.number().nullable(),
  }),
  warnings: z.array(z.string()),
  sampleSizes: z.object({ genuine: z.number(), impostor: z.number() }).nullable(),
  curves: z.object({
    errors: z.array(z.object({ tau: z.number(), far: z.number(), frr: z.number(), cost: z.number() })),
    roc: z.array(z.object({ far: z.number(), tar: z.number() })),
  }),
  meta: metaSchema,
});
export type ThresholdOptimizeResponse = z.infer<typeof thresholdOptimizeResponseSchema>;
