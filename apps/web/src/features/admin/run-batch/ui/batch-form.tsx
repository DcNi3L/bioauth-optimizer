'use client';

import { useId, useState } from 'react';

import { useT } from '@/shared/i18n';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, Checkbox, NumberField, TextField } from '@/shared/ui';

import { useStartBatch } from '../api/batch';

/** Загрузка архива набора изображений: «<субъект>/<файл>.jpg», общая корневая папка допускается. */
export function BatchForm() {
  const t = useT();
  const start = useStartBatch();
  const fileId = useId();
  const [file, setFile] = useState<File | null>(null);
  const [name, setName] = useState('');
  const [seed, setSeed] = useState('0');
  const [maxImpostor, setMaxImpostor] = useState('100000');
  const [include, setInclude] = useState(false);
  const s = parseNumber(seed);
  const m = parseNumber(maxImpostor);
  const valid =
    file !== null &&
    s !== null &&
    Number.isInteger(s) &&
    s >= 0 &&
    m !== null &&
    Number.isInteger(m) &&
    m >= 1 &&
    m <= 900_000;
  return (
    <div className="flex flex-col gap-4">
      <label
        htmlFor={fileId}
        className="flex cursor-pointer flex-col gap-1 rounded-md border border-dashed border-graphite/50 bg-paper px-4 py-5 text-sm hover:border-ink"
      >
        <span className="font-medium">{file ? file.name : t('algo.batch.pickZip')}</span>
        <span className="text-graphite">{t('algo.batch.layout')}</span>
        <input
          id={fileId}
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        />
      </label>
      <TextField
        label={t('algo.batch.nameLabel')}
        placeholder={t('algo.batch.namePlaceholder')}
        value={name}
        onChange={(e) => setName(e.target.value)}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <NumberField
          label={t('algo.batch.seed')}
          value={seed}
          onChange={(e) => setSeed(e.target.value)}
          hint={t('algo.batch.seedHint')}
        />
        <NumberField
          label={t('algo.batch.maxImpostor')}
          value={maxImpostor}
          onChange={(e) => setMaxImpostor(e.target.value)}
          hint={t('algo.batch.maxHint')}
        />
      </div>
      <Checkbox
        label={t('algo.batch.include')}
        checked={include}
        onChange={(e) => setInclude(e.target.checked)}
      />
      <ApiErrorNotice error={start.error} />
      <div>
        <Button
          disabled={!valid}
          busy={start.isPending}
          onClick={() =>
            file &&
            start.mutate(
              { file, name, seed: s!, maxImpostor: m!, includeInCalibration: include },
              { onSuccess: () => setFile(null) },
            )
          }
        >
          {t('algo.batch.start')}
        </Button>
      </div>
    </div>
  );
}
