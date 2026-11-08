'use client';

import type { FactorSelectionResponse } from '@bioauth/contracts';

import { useT } from '@/shared/i18n';
import { formatMs, formatNumber, formatPercent, formatSci } from '@/shared/lib';
import { Metric } from '@/shared/ui';

type Result = Pick<FactorSelectionResponse, 'optimum' | 'stats' | 'solver'>;

/** Оптимальный набор факторов, его метрики и как он получен. */
export function FactorSelectionSummary({
  result,
  factorNames,
}: {
  result: Result;
  factorNames: Record<string, string>;
}) {
  const t = useT();
  const { optimum, stats, solver } = result;
  if (!optimum) return null;

  const CONSTRAINT_LABELS: Record<string, string> = {
    latencyMaxMs: t('algo.factors.constraintLatency'),
    budget: t('algo.factors.constraintBudget'),
    farMax: t('algo.factors.constraintFar'),
    minPadFactors: t('algo.factors.constraintPad'),
  };

  const REJECT_LABELS: Record<string, string> = {
    latency: t('algo.factors.rejectByLatency'),
    budget: t('algo.factors.rejectByBudget'),
    pad: t('algo.factors.rejectByPad'),
    far: t('algo.factors.rejectByFar'),
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-graphite text-sm">{t('algo.factors.summaryRule')}</p>
        <p className="text-optimum mt-1 font-serif text-3xl">{optimum.codes.join(' + ')}</p>
        <p className="text-graphite mt-1 text-sm">
          {optimum.codes.map((c) => factorNames[c] ?? c).join(', ')}
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
        <Metric label="E = cFA·FAR + cFR·FRR" value={formatNumber(optimum.objective, 6)} tone="optimum" />
        <Metric label="FAR" value={formatSci(optimum.far, 2)} tone="far" />
        <Metric label="FRR" value={formatPercent(optimum.frr, 3)} tone="frr" />
        <Metric label={t('algo.factors.colLatency')} value={formatMs(optimum.latencyMs)} />
        <Metric label={t('algo.factors.colCost')} value={formatNumber(optimum.cost, 3)} />
      </div>
      <dl className="grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-graphite">{t('algo.factors.summaryActiveConstraints')}</dt>
          <dd>
            {optimum.activeConstraints.length === 0
              ? t('algo.factors.summaryNoConstraints')
              : optimum.activeConstraints.map((c) => CONSTRAINT_LABELS[c] ?? c).join(', ')}
          </dd>
        </div>
        <div>
          <dt className="text-graphite">{t('algo.factors.summaryFeasible')}</dt>
          <dd className="num">
            {stats.feasibleCount === null
              ? t('algo.factors.summaryFeasiblePartial', { total: stats.subsetsTotal.toLocaleString() })
              : t('algo.factors.summaryFeasibleFull', {
                  feasible: stats.feasibleCount.toLocaleString(),
                  total: stats.subsetsTotal.toLocaleString(),
                })}
          </dd>
        </div>
        {stats.rejectedBy && (
          <div className="sm:col-span-2">
            <dt className="text-graphite">{t('algo.factors.summaryRejected')}</dt>
            <dd className="num">
              {Object.entries(stats.rejectedBy)
                .map(([k, v]) => `${REJECT_LABELS[k] ?? k}: ${v}`)
                .join('; ')}
            </dd>
          </div>
        )}
        <div className="sm:col-span-2">
          <dt className="text-graphite">{t('algo.factors.summaryMethod')}</dt>
          <dd>
            {solver.used === 'exhaustive'
              ? t('algo.factors.summaryExhaustive')
              : t('algo.factors.summaryIlp', {
                  iter: solver.certificate?.iterations ?? 0,
                  lb: formatNumber(solver.certificate?.lowerBound ?? null, 6),
                  proven: solver.certificate?.proven
                    ? t('algo.factors.summaryProven')
                    : t('algo.factors.summaryNotProven'),
                })}
          </dd>
        </div>
      </dl>
    </div>
  );
}
