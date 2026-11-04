import { z } from 'zod';

const finite = (label: string) => z.number({ error: `${label}: ожидается число` }).finite();

export const costsSchema = z.strictObject({
  cFA: finite('cFA').gt(0, { error: 'cFA должно быть > 0' }),
  cFR: finite('cFR').gt(0, { error: 'cFR должно быть > 0' }),
});
export type CostsDto = z.infer<typeof costsSchema>;

export const probabilitySchema = (label: string) =>
  finite(label).gt(0, { error: `${label} должно быть > 0` }).lt(1, { error: `${label} должно быть < 1` });

export const farMaxSchema = probabilitySchema('FAR_max').nullable();

export const normalParamsSchema = z.strictObject({
  mean: finite('среднее'),
  std: finite('стандартное отклонение').gt(0, { error: 'стандартное отклонение должно быть > 0' }),
});
export type NormalParamsDto = z.infer<typeof normalParamsSchema>;

export const uuidSchema = z.uuid({ error: 'ожидается UUID' });

export const metaSchema = z.object({ coreVersion: z.string(), durationMs: z.number() });
export type MetaDto = z.infer<typeof metaSchema>;

export { finite };
