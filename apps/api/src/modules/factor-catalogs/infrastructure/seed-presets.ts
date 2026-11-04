import { SRO1_FACTOR_EXAMPLE } from '@bioauth/optimization-core';

import type { Db } from '../../../shared/database/kysely';
import { KyselyFactorCatalogRepository } from './kysely-factor-catalog.repository';

export const SRO1_PRESET_NAME = 'СРО1 — модельный пример (табл. 2)';

/** Идемпотентно создаёт предустановленный каталог F1–F5 из статьи СРО1. */
export async function seedPresetCatalogs(db: Db): Promise<boolean> {
  const exists = await db
    .selectFrom('factor_catalog')
    .select('id')
    .where('name', '=', SRO1_PRESET_NAME)
    .executeTakeFirst();
  if (exists) return false;
  await new KyselyFactorCatalogRepository(db).create(
    {
      name: SRO1_PRESET_NAME,
      description: 'Факторы F1–F5 из раздела 4 статьи СРО1; PAD — у F1 и F2 (восстановлено по рис. 2б).',
      factors: SRO1_FACTOR_EXAMPLE.factors,
    },
    true,
  );
  return true;
}
