'use client';

import type { FactorCatalogDto } from '@bioauth/contracts';
import { useFactorCatalogs } from '@/entities/factor-catalog';
import { SelectField } from '@/shared/ui';

/** Загрузка факторов из сохранённого каталога в таблицу. */
export function CatalogPicker({ onPick }: { onPick: (catalog: FactorCatalogDto) => void }) {
  const catalogs = useFactorCatalogs();
  return (
    <SelectField
      label="Загрузить из каталога"
      value=""
      disabled={!catalogs.data}
      hint={catalogs.isError ? 'Каталоги недоступны' : undefined}
      onChange={(e) => {
        const c = catalogs.data?.items.find((x) => x.id === e.target.value);
        if (c) onPick(c);
      }}
    >
      <option value="">{catalogs.isLoading ? 'Загрузка…' : 'Выберите каталог'}</option>
      {catalogs.data?.items.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name} ({c.factors.length})
        </option>
      ))}
    </SelectField>
  );
}
