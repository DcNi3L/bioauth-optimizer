import { z } from 'zod';

export const experimentTypeSchema = z.enum(['THRESHOLD', 'FACTOR_SELECTION', 'BUDGET_SWEEP']);
export type ExperimentType = z.infer<typeof experimentTypeSchema>;
export const experimentStatusSchema = z.enum(['OK', 'INFEASIBLE']);

export const experimentListQuerySchema = z.strictObject({
  type: experimentTypeSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().max(200).optional(),
});
export type ExperimentListQuery = z.output<typeof experimentListQuerySchema>;

export const experimentSummarySchema = z.object({
  id: z.string(),
  type: experimentTypeSchema,
  status: experimentStatusSchema,
  solver: z.string().nullable(),
  coreVersion: z.string(),
  durationMs: z.number(),
  createdAt: z.string(),
  /** Короткое описание результата для таблицы истории. */
  headline: z.string(),
});
export type ExperimentSummaryDto = z.infer<typeof experimentSummarySchema>;

export const experimentListSchema = z.object({
  items: z.array(experimentSummarySchema),
  nextCursor: z.string().nullable(),
});
export type ExperimentListDto = z.infer<typeof experimentListSchema>;

export const experimentDetailSchema = experimentSummarySchema.extend({
  input: z.unknown(),
  result: z.unknown(),
});
export type ExperimentDetailDto = z.infer<typeof experimentDetailSchema>;
