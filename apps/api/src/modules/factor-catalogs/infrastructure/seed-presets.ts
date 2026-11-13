import { SRO1_FACTOR_EXAMPLE } from '@bioauth/optimization-core';

import type { Db } from '../../../shared/database/kysely';
import { KyselyFactorCatalogRepository } from './kysely-factor-catalog.repository';

export const SRO1_PRESET_NAME = 'СРО1 — модельный пример (табл. 2)';
export const V33_PRESET_NAME = 'v3.3 — факторы реализованной системы';

/**
 * Факторы, которые система умеет проверять сейчас. Числа до накопления собственных измерений — заявленные
 * или расчётные; после калибровки их заменяет измеренный каталог (`/factor-catalogs/measured`).
 * TOTP: окно ±1 шаг принимает 3 кода из 10⁶, поэтому FAR = 3·10⁻⁶. Ритм набора: порог 1,1 на модельных данных
 * даёт FAR ≈ 1,5 % и FRR ≈ 10 %; на людях точность ниже, в литературе EER порядка 5–15 %.
 */
export const V33_FACTORS = [
  {
    code: 'FACE',
    name: 'Лицо (SFace) + PAD, три команды',
    far: 1e-3,
    frr: 0.03,
    latencyMs: 4000,
    cost: 1.0,
    hasPad: true,
    provenance: 'declared' as const,
  },
  {
    code: 'PASSKEY',
    name: 'Passkey (WebAuthn, отпечаток на устройстве)',
    far: 2e-5,
    frr: 0.01,
    latencyMs: 1500,
    cost: 0.5,
    hasPad: true,
    provenance: 'declared' as const,
  },
  {
    code: 'TOTP',
    name: 'Приложение-аутентификатор (TOTP)',
    far: 3e-6,
    frr: 0.02,
    latencyMs: 8000,
    cost: 0.1,
    hasPad: false,
    provenance: 'declared' as const,
  },
  {
    code: 'KEYSTROKE',
    name: 'Ритм набора текста',
    far: 0.015,
    frr: 0.1,
    latencyMs: 6000,
    cost: 0.05,
    hasPad: false,
    provenance: 'literature' as const,
  },
];

/** Идемпотентно создаёт предустановленные каталоги; true — создан хотя бы один. */
export async function seedPresetCatalogs(db: Db): Promise<boolean> {
  const repo = new KyselyFactorCatalogRepository(db);
  const has = async (name: string) =>
    (await db.selectFrom('factor_catalog').select('id').where('name', '=', name).executeTakeFirst()) !==
    undefined;
  let created = false;
  if (!(await has(SRO1_PRESET_NAME))) {
    await repo.create(
      {
        name: SRO1_PRESET_NAME,
        description: 'Факторы F1–F5 из раздела 4 статьи СРО1; PAD — у F1 и F2 (восстановлено по рис. 2б).',
        factors: SRO1_FACTOR_EXAMPLE.factors,
      },
      true,
    );
    created = true;
  }
  if (!(await has(V33_PRESET_NAME))) {
    await repo.create(
      {
        name: V33_PRESET_NAME,
        description:
          'Лицо, passkey, TOTP и ритм набора — то, что проверяет система. Числа заявленные или расчётные; ' +
          'после калибровки их заменяет измеренный каталог.',
        factors: V33_FACTORS,
      },
      true,
    );
    created = true;
  }
  return created;
}
