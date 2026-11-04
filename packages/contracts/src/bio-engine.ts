import { z } from 'zod';

/**
 * Контракт внутреннего сервиса bio-engine (services/bio-engine, docs/10 §10.8). Зеркало pydantic-схем
 * services/bio-engine/app/api/schemas.py; примеры запросов и ответов в fixtures/bio-engine проверяются
 * тестами обеих сторон, поэтому расхождение схем ломает CI.
 */

export const EMBEDDING_DIM = 128;

export const faceIssueSchema = z.enum([
  'NO_FACE',
  'MANY_FACES',
  'LOW_CONFIDENCE',
  'TOO_SMALL',
  'BLURRY',
  'TOO_DARK',
  'TOO_BRIGHT',
  'POSE',
]);
export type FaceIssue = z.infer<typeof faceIssueSchema>;

export const livenessCommandSchema = z.enum(['TURN_LEFT', 'TURN_RIGHT', 'CHIN_UP', 'MOVE_CLOSER']);
export type LivenessCommand = z.infer<typeof livenessCommandSchema>;

export const stepFailureSchema = z.enum(['NO_FACE', 'NOT_PERFORMED', 'TIMING']);

const embeddingSchema = z.array(z.number()).length(EMBEDDING_DIM);

export const bioFrameSchema = z.strictObject({
  image: z.string().min(16),
  ts: z.number().int().nonnegative().nullable().optional(),
});
export type BioFrame = z.infer<typeof bioFrameSchema>;

export const bioFramesRequestSchema = z.strictObject({ frames: z.array(bioFrameSchema).min(1) });

export const frameAnalysisSchema = z.object({
  faces: z.number().int(),
  face: z
    .object({
      bbox: z.array(z.number()).length(4),
      landmarks: z.array(z.array(z.number()).length(2)).length(5),
      score: z.number(),
    })
    .nullable(),
  quality: z
    .object({
      interocularPx: z.number(),
      sharpness: z.number(),
      brightness: z.number(),
      yawDeg: z.number(),
      pitchDeg: z.number(),
    })
    .nullable(),
  issues: z.array(faceIssueSchema),
});
export type FrameAnalysis = z.infer<typeof frameAnalysisSchema>;

export const bioAnalyzeResponseSchema = z.object({
  frames: z.array(frameAnalysisSchema),
  modelVersion: z.string(),
});

export const bioTemplateResponseSchema = z.object({
  embedding: embeddingSchema,
  modelVersion: z.string(),
  framesUsed: z.number().int(),
  pairScores: z.array(z.number()),
  pLiveMedian: z.number(),
  padVersion: z.string(),
  frames: z.array(frameAnalysisSchema),
});
export type BioTemplateResponse = z.infer<typeof bioTemplateResponseSchema>;

export const bioVerifyRequestSchema = z.strictObject({
  frames: z.array(bioFrameSchema).min(1),
  template: z.strictObject({ embedding: embeddingSchema, modelVersion: z.string() }),
});

export const bioVerifyResponseSchema = z.object({
  score: z.number(),
  scores: z.array(z.number()),
  consistency: z.number(),
  framesUsed: z.number().int(),
  probeEmbedding: embeddingSchema,
  modelVersion: z.string(),
  frames: z.array(frameAnalysisSchema),
});
export type BioVerifyResponse = z.infer<typeof bioVerifyResponseSchema>;

export const bioLivenessRequestSchema = z.strictObject({
  baseline: z.array(bioFrameSchema).min(1),
  steps: z
    .array(z.strictObject({ command: livenessCommandSchema, frames: z.array(bioFrameSchema).min(1) }))
    .min(1)
    .max(5),
});
export type BioLivenessRequest = z.infer<typeof bioLivenessRequestSchema>;

export const bioLivenessResponseSchema = z.object({
  pLiveMedian: z.number(),
  pLive: z.array(z.number()),
  commands: z.array(
    z.object({
      command: livenessCommandSchema,
      passed: z.boolean(),
      measure: z.number().nullable(),
      failure: stepFailureSchema.nullable(),
    }),
  ),
  identityConsistent: z.boolean(),
  minPairwiseSimilarity: z.number(),
  modelVersion: z.string(),
  padVersion: z.string(),
});
export type BioLivenessResponse = z.infer<typeof bioLivenessResponseSchema>;

export const bioProblemSchema = z.looseObject({
  type: z.string(),
  title: z.string(),
  status: z.number().int(),
  detail: z.string(),
  code: z.string(),
  frames: z.array(frameAnalysisSchema).optional(),
});
export type BioProblem = z.infer<typeof bioProblemSchema>;
