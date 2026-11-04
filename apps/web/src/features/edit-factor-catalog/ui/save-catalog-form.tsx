'use client';

import { factorCatalogUpsertSchema, type FactorDto } from '@bioauth/contracts';
import { useState } from 'react';

import { ApiErrorNotice, Button, TextField } from '@/shared/ui';

import { useCreateCatalog } from '../api/use-create-catalog';

/** Сохранение текущей таблицы факторов как нового каталога. */
export function SaveCatalogForm({ getFactors }: { getFactors: () => FactorDto[] }) {
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const create = useCreateCatalog();

  const save = () => {
    const req = { name, description: null, factors: getFactors() };
    const parsed = factorCatalogUpsertSchema.safeParse(req);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Проверьте факторы');
      return;
    }
    setError(null);
    create.mutate(req, { onSuccess: () => setName('') });
  };

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          label="Сохранить факторы как каталог"
          placeholder="Название каталога"
          value={name}
          error={error ?? undefined}
          onChange={(e) => setName(e.target.value)}
          className="min-w-64 flex-1"
        />
        <Button variant="secondary" onClick={save} busy={create.isPending}>
          Сохранить
        </Button>
      </div>
      {create.isSuccess && <p className="text-optimum text-xs">Каталог «{create.data.name}» сохранён</p>}
      <ApiErrorNotice error={create.error} />
    </div>
  );
}
