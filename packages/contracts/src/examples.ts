import { z } from 'zod';

import { factorSelectionRequestSchema } from './factor-selection';
import { thresholdOptimizeRequestSchema } from './threshold';

export const sro1ExamplesSchema = z.object({
  threshold: thresholdOptimizeRequestSchema,
  factorSelection: factorSelectionRequestSchema,
  source: z.string(),
});
export type Sro1ExamplesDto = z.input<typeof sro1ExamplesSchema>;
