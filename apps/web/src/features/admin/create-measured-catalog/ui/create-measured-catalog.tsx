'use client';

import { measuredCatalogResponseSchema } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { catalogKeys } from '@/entities/factor-catalog';
import { apiSend } from '@/shared/api';
import { ApiErrorNotice, Button, Notice, TextField } from '@/shared/ui';

/** Каталог факторов из измерений — вход решателя состава факторов v1 (страница «Состав факторов»). */
export function CreateMeasuredCatalog() {
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const create = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        '/calibration/factors/catalog',
        { name: name.trim() || null },
        measuredCatalogResponseSchema,
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: catalogKeys.all }),
  });
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <TextField
          className="min-w-64 flex-1"
          label="Название каталога"
          placeholder="Измерения пилота"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button busy={create.isPending} onClick={() => create.mutate()}>
          Сохранить как каталог факторов
        </Button>
      </div>
      <ApiErrorNotice error={create.error} />
      {create.data && (
        <Notice tone="success">
          Каталог «{create.data.name}» сохранён.{' '}
          <Link href="/algorithm/factors" className="underline underline-offset-4">
            Подобрать состав факторов
          </Link>
        </Notice>
      )}
    </div>
  );
}
