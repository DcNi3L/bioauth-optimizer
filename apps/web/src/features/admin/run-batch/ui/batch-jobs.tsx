'use client';

import type { BatchJobDto } from '@bioauth/contracts';
import Link from 'next/link';

import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Button, Metric, Notice } from '@/shared/ui';

import { batchCsvUrl, useBatchJobs, useCancelBatch } from '../api/batch';

const STATE: Record<BatchJobDto['state'], string> = {
  running: 'выполняется',
  done: 'готово',
  failed: 'ошибка',
  cancelled: 'отменена',
};
const STAGE = { scoring: 'распознавание и сравнение пар', saving: 'сохранение набора оценок' } as const;
const SKIP: Record<string, string> = { NO_FACE: 'лицо не найдено', INVALID_IMAGE: 'не изображение' };

function Job({ job }: { job: BatchJobDto }) {
  const cancel = useCancelBatch();
  const r = job.result;
  return (
    <li className="border-rule rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">{job.name}</h3>
        <span
          className={`text-xs ${job.state === 'failed' ? 'text-far' : job.state === 'done' ? 'text-optimum' : 'text-graphite'}`}
        >
          {STATE[job.state]}
          {job.stage ? `: ${STAGE[job.stage]}…` : ''}
        </span>
        <span className="text-graphite text-xs">
          {job.filename} · seed {job.seed} · запущена {formatDateTime(job.startedAt)}
        </span>
        {job.state === 'running' && (
          <Button variant="ghost" busy={cancel.isPending} onClick={() => cancel.mutate(job.id)}>
            Отменить
          </Button>
        )}
      </div>
      <ApiErrorNotice error={cancel.error} />
      {job.error && job.state === 'failed' && (
        <div className="mt-2">
          <Notice tone="error">{job.error}</Notice>
        </div>
      )}
      {r && (
        <div className="mt-3 flex flex-col gap-3">
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Metric label="Субъектов" value={r.subjects} />
            <Metric label="Изображений (годных)" value={`${r.images} (${r.imagesUsed})`} />
            <Metric label="Genuine-пар" value={r.genuineCount.toLocaleString('ru-RU')} tone="frr" />
            <Metric label="Impostor-пар" value={r.impostorCount.toLocaleString('ru-RU')} tone="far" />
            <Metric label="Подтверждаемый FAR ≥" value={(3 / r.impostorCount).toExponential(1)} />
          </div>
          <p className="text-graphite text-xs">
            Модель <span className="num">{r.modelVersion}</span>.{' '}
            {r.impostorSampled
              ? `Impostor-пары — выборка из ${r.impostorTotal.toLocaleString('ru-RU')} возможных.`
              : 'Взяты все impostor-пары.'}
            {job.includeInCalibration && ' Оценки добавлены в калибровку.'}
          </p>
          {r.skippedTotal > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">Пропущено файлов: {r.skippedTotal}</summary>
              <ul className="text-graphite mt-1 list-inside list-disc text-xs">
                {r.skipped.map((x) => (
                  <li key={x.file}>
                    <span className="num">{x.file}</span> — {SKIP[x.reason] ?? x.reason}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <a className="text-frr underline underline-offset-4" href={batchCsvUrl(job.id)}>
              Скачать CSV
            </a>
            <Link className="text-frr underline underline-offset-4" href="/algorithm/threshold">
              Рассчитать порог по CSV (страница «Порог»)
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

export function BatchJobs() {
  const jobs = useBatchJobs();
  if (jobs.error) return <ApiErrorNotice error={jobs.error} />;
  if (!jobs.data) return null;
  if (jobs.data.length === 0) return <p className="text-graphite text-sm">Задач пока нет.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {jobs.data.map((j) => (
        <Job key={j.id} job={j} />
      ))}
    </ol>
  );
}
