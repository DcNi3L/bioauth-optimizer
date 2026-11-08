'use client';

import type { BatchJobDto } from '@bioauth/contracts';
import Link from 'next/link';

import type { TKey } from '@/shared/i18n';
import { useT } from '@/shared/i18n';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Button, Metric, Notice } from '@/shared/ui';

import { batchCsvUrl, useBatchJobs, useCancelBatch } from '../api/batch';

const STATE: Record<BatchJobDto['state'], TKey> = {
  running: 'algo.batch.running',
  done: 'algo.batch.done',
  failed: 'algo.batch.failed',
  cancelled: 'algo.batch.cancelled',
};
const STAGE = {
  scoring: 'algo.batch.stageScoring',
  saving: 'algo.batch.stageSaving',
} as const satisfies Record<string, TKey>;
const SKIP: Record<string, TKey> = {
  NO_FACE: 'algo.batch.skipNoFace',
  INVALID_IMAGE: 'algo.batch.skipInvalid',
};

function reasonText(t: ReturnType<typeof useT>, reason: string) {
  const key = SKIP[reason];
  return key ? t(key) : reason;
}

function Job({ job }: { job: BatchJobDto }) {
  const t = useT();
  const cancel = useCancelBatch();
  const r = job.result;
  return (
    <li className="border-rule rounded-md border p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h3 className="font-medium">{job.name}</h3>
        <span
          className={`text-xs ${job.state === 'failed' ? 'text-far' : job.state === 'done' ? 'text-optimum' : 'text-graphite'}`}
        >
          {t(STATE[job.state])}
          {job.stage ? `: ${t(STAGE[job.stage])}…` : ''}
        </span>
        <span className="text-graphite text-xs">
          {t('algo.batch.started', { file: job.filename, seed: job.seed, at: formatDateTime(job.startedAt) })}
        </span>
        {job.state === 'running' && (
          <Button variant="ghost" busy={cancel.isPending} onClick={() => cancel.mutate(job.id)}>
            {t('algo.batch.cancel')}
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
            <Metric label={t('algo.batch.subjects')} value={r.subjects} />
            <Metric label={t('algo.batch.images')} value={`${r.images} (${r.imagesUsed})`} />
            <Metric
              label={t('algo.batch.genuinePairs')}
              value={r.genuineCount.toLocaleString('ru-RU')}
              tone="frr"
            />
            <Metric
              label={t('algo.batch.impostorPairs')}
              value={r.impostorCount.toLocaleString('ru-RU')}
              tone="far"
            />
            <Metric label={t('algo.batch.farBound')} value={(3 / r.impostorCount).toExponential(1)} />
          </div>
          <p className="text-graphite text-xs">
            {t('algo.batch.model', { version: r.modelVersion })}{' '}
            {r.impostorSampled
              ? t('algo.batch.sampled', { n: r.impostorTotal.toLocaleString('ru-RU') })
              : t('algo.batch.allPairs')}{' '}
            {job.includeInCalibration && t('algo.batch.added')}
          </p>
          {r.skippedTotal > 0 && (
            <details className="text-sm">
              <summary className="cursor-pointer">{t('algo.batch.skipped', { n: r.skippedTotal })}</summary>
              <ul className="text-graphite mt-1 list-inside list-disc text-xs">
                {r.skipped.map((x) => (
                  <li key={x.file}>
                    <span className="num">{x.file}</span> — {reasonText(t, x.reason)}
                  </li>
                ))}
              </ul>
            </details>
          )}
          <div className="flex flex-wrap gap-4 text-sm">
            <a className="text-frr underline underline-offset-4" href={batchCsvUrl(job.id)}>
              {t('algo.batch.downloadCsv')}
            </a>
            <Link className="text-frr underline underline-offset-4" href="/algorithm/threshold">
              {t('algo.batch.toThreshold')}
            </Link>
          </div>
        </div>
      )}
    </li>
  );
}

function EmptyJobs() {
  const t = useT();
  return <p className="text-graphite text-sm">{t('algo.batch.empty')}</p>;
}

export function BatchJobs() {
  const jobs = useBatchJobs();
  if (jobs.error) return <ApiErrorNotice error={jobs.error} />;
  if (!jobs.data) return null;
  if (jobs.data.length === 0) return <EmptyJobs />;
  return (
    <ol className="flex flex-col gap-3">
      {jobs.data.map((j) => (
        <Job key={j.id} job={j} />
      ))}
    </ol>
  );
}
