'use client';

import type { ThresholdOptimizeResponse } from '@bioauth/contracts';

import { useT } from '@/shared/i18n';
import { formatNumber, formatPercent } from '@/shared/lib';
import { Metric, Notice } from '@/shared/ui';

type Result = Pick<
  ThresholdOptimizeResponse,
  'eer' | 'optimal' | 'lossReduction' | 'verification' | 'warnings' | 'method' | 'sampleSizes'
>;

function OperatingPointColumn({
  title,
  point,
  emphasis,
}: {
  title: string;
  point: Result['eer'];
  emphasis?: boolean;
}) {
  return (
    <div className={`flex flex-col gap-3 ${emphasis ? '' : 'text-graphite'}`}>
      <p className="text-sm">{title}</p>
      <p className={`num font-serif ${emphasis ? 'text-4xl text-optimum' : 'text-2xl text-ink'}`}>
        <span className="formula">τ</span> = {point.tau === null ? '—' : formatNumber(point.tau)}
      </p>
      <div className="grid grid-cols-3 gap-3">
        <Metric label="FAR" value={formatPercent(point.far)} tone="far" />
        <Metric label="FRR" value={formatPercent(point.frr)} tone="frr" />
        <Metric label="E(τ)" value={formatNumber(point.cost, 6)} />
      </div>
    </div>
  );
}

/** Сравнение точки равных ошибок и оптимального порога (формула 1 СРО1). */
export function ThresholdSummary({ result }: { result: Result }) {
  const t = useT();
  const { eer, optimal, lossReduction, verification, warnings } = result;
  const degenerate = optimal.degenerate;
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-6 sm:grid-cols-[1fr_auto_1fr] sm:items-start">
        <OperatingPointColumn title={t('algo.threshold.eerTitle')} point={eer} />
        <div className="hidden h-full w-px bg-rule sm:block" aria-hidden />
        <OperatingPointColumn title={t('algo.threshold.optimalTitle')} point={optimal} emphasis />
      </div>

      {lossReduction !== null && !degenerate && (
        <p className="max-w-prose text-[15px]">
          {t('algo.threshold.lossReduction', {
            pct: formatPercent(lossReduction, 1),
            from: formatNumber(eer.cost, 4),
            to: formatNumber(optimal.cost, 4),
          })}
        </p>
      )}

      {optimal.interval && (
        <p className="text-sm text-graphite">
          {t('algo.threshold.interval', {
            lo: optimal.interval[0] === null ? '−∞' : formatNumber(optimal.interval[0], 6),
            hi: optimal.interval[1] === null ? '+∞' : formatNumber(optimal.interval[1], 6),
          })}
          {result.sampleSizes &&
            ` ${t('algo.threshold.intervalSamples', {
              genuine: result.sampleSizes.genuine.toLocaleString(),
              impostor: result.sampleSizes.impostor.toLocaleString(),
            })}`}
        </p>
      )}
      {optimal.constrainedByFarMax && <Notice tone="info">{t('algo.threshold.farMaxNote')}</Notice>}
      {warnings.map((w) => (
        <Notice key={w} tone="caution">
          {w}
        </Notice>
      ))}
      <p className="text-xs text-graphite">
        {verification.status === 'ok' &&
          t('algo.threshold.verifyOk', { diff: formatNumber(verification.absDiff ?? 0, 2) })}
        {verification.status === 'exact' && t('algo.threshold.verifyExact')}
        {verification.status === 'skipped' && t('algo.threshold.verifySkipped')}
      </p>
    </div>
  );
}
