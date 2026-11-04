import { z } from 'zod';

export const MAX_DATASET_ROWS = 1_000_000;
export const HISTOGRAM_BINS = 40;

export const scoreDatasetSchema = z.object({
  id: z.string(),
  name: z.string(),
  originalFilename: z.string(),
  genuineCount: z.number(),
  impostorCount: z.number(),
  min: z.number(),
  max: z.number(),
  histogram: z.object({
    edges: z.array(z.number()),
    genuine: z.array(z.number()),
    impostor: z.array(z.number()),
  }),
  createdAt: z.string(),
});
export type ScoreDatasetDto = z.infer<typeof scoreDatasetSchema>;
