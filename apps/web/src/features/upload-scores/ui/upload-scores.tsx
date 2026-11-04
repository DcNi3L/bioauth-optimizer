'use client';

import type { ScoreDatasetDto } from '@bioauth/contracts';
import { useId } from 'react';

import { DatasetCard } from '@/entities/score-dataset';
import { ApiErrorNotice } from '@/shared/ui';

import { useUploadScores } from '../api/use-upload-scores';

/** Загрузка CSV с колонками score,label (label: genuine / impostor). */
export function UploadScores({
  dataset,
  onUploaded,
}: {
  dataset: ScoreDatasetDto | null;
  onUploaded: (d: ScoreDatasetDto) => void;
}) {
  const upload = useUploadScores();
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <label
        htmlFor={id}
        className="border-graphite/50 bg-paper hover:border-ink flex cursor-pointer flex-col gap-1 rounded-md border border-dashed px-4 py-5 text-sm"
      >
        <span className="font-medium">{upload.isPending ? 'Загружаю…' : 'Выберите CSV-файл с оценками'}</span>
        <span className="text-graphite">
          Колонки <span className="num">score</span> и <span className="num">label</span> (genuine или
          impostor). Разделитель «,» или «;», до 1 000 000 строк.
        </span>
        <input
          id={id}
          type="file"
          accept=".csv,text/csv,text/plain"
          className="sr-only"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) upload.mutate(file, { onSuccess: onUploaded });
            e.target.value = '';
          }}
        />
      </label>
      <ApiErrorNotice error={upload.error} />
      {dataset && <DatasetCard dataset={dataset} />}
    </div>
  );
}
