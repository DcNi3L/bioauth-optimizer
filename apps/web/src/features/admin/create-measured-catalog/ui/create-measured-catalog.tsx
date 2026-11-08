'use client';

import { measuredCatalogResponseSchema } from '@bioauth/contracts';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useState } from 'react';

import { catalogKeys } from '@/entities/factor-catalog';
import { apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, Notice, TextField } from '@/shared/ui';

/** Каталог факторов из измерений — вход решателя состава факторов v1 (страница «Состав факторов»). */
export function CreateMeasuredCatalog() {
  const t = useT();
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
          label={t('algo.calibration.catalogName')}
          placeholder={t('algo.calibration.catalogPlaceholder')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button busy={create.isPending} onClick={() => create.mutate()}>
          {t('algo.calibration.saveCatalog')}
        </Button>
      </div>
      <ApiErrorNotice error={create.error} />
      {create.data && (
        <Notice tone="success">
          {t('algo.calibration.catalogSaved', { name: create.data.name })}{' '}
          <Link href="/algorithm/factors" className="underline underline-offset-4">
            {t('algo.calibration.pickFactors')}
          </Link>
        </Notice>
      )}
    </div>
  );
}
