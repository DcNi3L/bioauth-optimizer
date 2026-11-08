'use client';

import type { FactorCatalogDto } from '@bioauth/contracts';

import { useFactorCatalogs } from '@/entities/factor-catalog';
import { useT } from '@/shared/i18n';
import { SelectField } from '@/shared/ui';

/** Загрузка факторов из сохранённого каталога в таблицу. */
export function CatalogPicker({ onPick }: { onPick: (catalog: FactorCatalogDto) => void }) {
  const t = useT();
  const catalogs = useFactorCatalogs();
  return (
    <SelectField
      label={t('algo.chrome.catalogLoad')}
      value=""
      disabled={!catalogs.data}
      hint={catalogs.isError ? t('algo.chrome.catalogUnavailable') : undefined}
      onChange={(e) => {
        const c = catalogs.data?.items.find((x) => x.id === e.target.value);
        if (c) onPick(c);
      }}
    >
      <option value="">{catalogs.isLoading ? t('common.loading') : t('algo.chrome.catalogPick')}</option>
      {catalogs.data?.items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.factors.length})
        </option>
      ))}
    </SelectField>
  );
}
