import { z } from 'zod';
import { costsSchema, farMaxSchema, finite, metaSchema, probabilitySchema, uuidSchema } from './common';

export const MAX_FACTORS = 50;

export const factorSchema = z.strictObject({
  code: z
    .string()
    .trim()
    .min(1, { error: 'код не может быть пустым' })
    .max(16, { error: 'код — не более 16 символов' })
    .regex(/^[\p{L}\p{N}_\-.]+$/u, { error: 'код: только буквы, цифры, «_», «-», «.»' }),
  name: z.string().trim().min(1, { error: 'название не может быть пустым' }).max(200),
  far: probabilitySchema('FAR'),
  frr: finite('FRR').min(0, { error: 'FRR должно быть ≥ 0' }).lt(1, { error: 'FRR должно быть < 1' }),
  latencyMs: finite('задержка').min(0, { error: 'задержка должна быть ≥ 0' }),
  cost: finite('стоимость').min(0, { error: 'стоимость должна быть ≥ 0' }),
  hasPad: z.boolean(),
});
export type FactorDto = z.infer<typeof factorSchema>;

export const factorListSchema = z
  .array(factorSchema)
  .min(1, { error: 'нужен хотя бы один фактор' })
  .max(MAX_FACTORS, { error: `не более ${MAX_FACTORS} факторов` })
  .superRefine((factors, ctx) => {
    const seen = new Set<string>();
    factors.forEach((f, i) => {
      if (seen.has(f.code)) ctx.addIssue({ code: 'custom', path: [i, 'code'], message: `код «${f.code}» повторяется` });
      seen.add(f.code);
    });
  });

const nonNegNullable = (label: string) => finite(label).min(0, { error: `${label} должно быть ≥ 0` }).nullable();

export const selectionConstraintsSchema = z.strictObject({
  latencyMaxMs: nonNegNullable('L_max').default(null),
  budget: nonNegNullable('бюджет').default(null),
  farMax: farMaxSchema.default(null),
  minPadFactors: z.int().min(0).max(MAX_FACTORS).default(1),
});

export const solverModeSchema = z.enum(['auto', 'exhaustive', 'ilp']);

const factorSourceRefine = (v: { factors?: unknown; catalogId?: unknown }, ctx: z.RefinementCtx) => {
  if ((v.factors === undefined) === (v.catalogId === undefined)) {
    ctx.addIssue({ code: 'custom', path: ['factors'], message: 'нужно передать ровно одно из полей: factors или catalogId' });
  }
};

const selectionBase = {
  factors: factorListSchema.optional(),
  catalogId: uuidSchema.optional(),
  costs: costsSchema,
  fusionRule: z.literal('AND').default('AND'),
};

export const factorSelectionRequestSchema = z
  .strictObject({
    ...selectionBase,
    constraints: selectionConstraintsSchema,
    solver: solverModeSchema.default('auto'),
    rankingLimit: z.int().min(1).max(1000).default(100),
  })
  .superRefine(factorSourceRefine);
export type FactorSelectionRequest = z.input<typeof factorSelectionRequestSchema>;
export type FactorSelectionCommand = z.output<typeof factorSelectionRequestSchema>;

export const budgetSweepRequestSchema = z
  .strictObject({
    ...selectionBase,
    constraints: selectionConstraintsSchema.omit({ budget: true }),
    sweep: z
      .strictObject({
        from: finite('sweep.from').min(0),
        to: finite('sweep.to').min(0),
        step: finite('sweep.step').gt(0),
      })
      .refine((s) => s.to >= s.from, { path: ['to'], message: 'конец диапазона должен быть ≥ начала' })
      .refine((s) => Math.floor((s.to - s.from) / s.step + 1e-9) + 1 <= 500, {
        path: ['step'],
        message: 'не более 500 точек',
      }),
  })
  .superRefine(factorSourceRefine);
export type BudgetSweepRequest = z.input<typeof budgetSweepRequestSchema>;
export type BudgetSweepCommand = z.output<typeof budgetSweepRequestSchema>;

export const subsetSolutionSchema = z.object({
  codes: z.array(z.string()),
  far: z.number(),
  frr: z.number(),
  latencyMs: z.number(),
  cost: z.number(),
  padCount: z.number(),
  objective: z.number(),
  activeConstraints: z.array(z.enum(['latencyMaxMs', 'budget', 'farMax', 'minPadFactors'])),
  slack: z.object({
    latencyMs: z.number().nullable(),
    budget: z.number().nullable(),
    logFar: z.number().nullable(),
    minPadFactors: z.number().nullable(),
  }),
});
export type SubsetSolutionDto = z.infer<typeof subsetSolutionSchema>;

export const factorSelectionResponseSchema = z.object({
  experimentId: z.string(),
  status: z.enum(['optimal', 'infeasible']),
  optimum: subsetSolutionSchema.nullable(),
  ranking: z.array(subsetSolutionSchema),
  rankingComplete: z.boolean(),
  stats: z.object({
    factorsCount: z.number(),
    subsetsTotal: z.number(),
    feasibleCount: z.number().nullable(),
    rejectedBy: z.object({ latency: z.number(), budget: z.number(), pad: z.number(), far: z.number() }).nullable(),
  }),
  solver: z.object({
    used: z.enum(['exhaustive', 'ilp']),
    certificate: z
      .object({
        iterations: z.number(),
        lowerBound: z.number().nullable(),
        bestObjective: z.number().nullable(),
        proven: z.boolean(),
      })
      .nullable(),
  }),
  meta: metaSchema,
});
export type FactorSelectionResponse = z.infer<typeof factorSelectionResponseSchema>;

const sweepPointSchema = z.object({
  budget: z.number(),
  codes: z.array(z.string()).nullable(),
  objective: z.number().nullable(),
});

export const budgetSweepResponseSchema = z.object({
  experimentId: z.string(),
  points: z.array(sweepPointSchema),
  breakpoints: z.array(sweepPointSchema.extend({ ratioToPrevious: z.number().nullable() })),
  meta: metaSchema,
});
export type BudgetSweepResponse = z.infer<typeof budgetSweepResponseSchema>;
