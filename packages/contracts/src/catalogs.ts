import { z } from 'zod';
import { factorListSchema, factorSchema } from './factor-selection';

export const factorCatalogUpsertSchema = z.strictObject({
  name: z.string().trim().min(1, { error: 'название не может быть пустым' }).max(200),
  description: z.string().trim().max(2000).nullable().default(null),
  factors: factorListSchema,
});
export type FactorCatalogUpsertRequest = z.input<typeof factorCatalogUpsertSchema>;
export type FactorCatalogUpsertCommand = z.output<typeof factorCatalogUpsertSchema>;

export const factorCatalogSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  isPreset: z.boolean(),
  factors: z.array(factorSchema),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type FactorCatalogDto = z.infer<typeof factorCatalogSchema>;

export const factorCatalogListSchema = z.object({ items: z.array(factorCatalogSchema) });
export type FactorCatalogListDto = z.infer<typeof factorCatalogListSchema>;
