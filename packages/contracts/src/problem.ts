import { z } from 'zod';

/** RFC 7807 application/problem+json. */
export const problemDetailsSchema = z.object({
  type: z.string(),
  title: z.string(),
  status: z.number(),
  detail: z.string().optional(),
  instance: z.string().optional(),
  requestId: z.string().optional(),
  errors: z.array(z.object({ path: z.string(), message: z.string() })).optional(),
  rejectedBy: z.record(z.string(), z.number()).optional(),
});
export type ProblemDetails = z.infer<typeof problemDetailsSchema>;

export const PROBLEM_TYPES = {
  validation: 'validation-error',
  infeasible: 'infeasible-problem',
  tooLarge: 'problem-too-large',
  notFound: 'not-found',
  conflict: 'conflict',
  internalConsistency: 'internal-consistency-error',
  internal: 'internal-error',
} as const;
