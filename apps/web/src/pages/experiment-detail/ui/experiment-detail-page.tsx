'use client';

import type {
  BudgetSweepResponse,
  FactorSelectionResponse,
  ThresholdOptimizeResponse,
} from '@bioauth/contracts';
import Link from 'next/link';

import { useExperiment } from '@/entities/experiment';
import { ExportButtons } from '@/features/export-result';
import { useT } from '@/shared/i18n';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Notice, Panel } from '@/shared/ui';
import { BudgetSensitivity } from '@/widgets/budget-sensitivity';
import { FactorRankingChart } from '@/widgets/factor-ranking-chart';
import { FactorSelectionSummary } from '@/widgets/factor-selection-summary';
import { ThresholdSummary } from '@/widgets/threshold-summary';

const EXPERIMENT_TYPE_LABELS_MAP = {
  THRESHOLD: 'algo.history.typeThreshold',
  FACTOR_SELECTION: 'algo.history.typeFactors',
  BUDGET_SWEEP: 'algo.history.typeBudget',
} as const;

const SOLVER_LABELS_MAP: Record<string, string> = {
  'gaussian-analytic': 'algo.history.solverGaussian',
  'empirical-sweep': 'algo.history.solverEmpirical',
  exhaustive: 'algo.history.solverExhaustive',
  ilp: 'algo.history.solverIlp',
};

export function ExperimentDetailPage({ id }: { id: string }) {
  const t = useT();
  const q = useExperiment(id);
  const e = q.data;

  const typeLabel = (type: keyof typeof EXPERIMENT_TYPE_LABELS_MAP) => t(EXPERIMENT_TYPE_LABELS_MAP[type]);
  const solverLabel = (solver: string) => {
    const key = SOLVER_LABELS_MAP[solver];
    return key ? t(key as Parameters<typeof t>[0]) : solver;
  };

  return (
    <div className="flex max-w-5xl flex-col gap-6">
      <Link href="/algorithm/history" className="text-frr w-fit text-sm hover:underline">
        {t('algo.history.back')}
      </Link>
      <ApiErrorNotice error={q.error} />
      {e && (
        <>
          <div>
            <h2 className="text-xl">{typeLabel(e.type)}</h2>
            <p className="text-graphite mt-1 text-sm">
              {formatDateTime(e.createdAt)}; {t('algo.history.methodLabel')}:{' '}
              {e.solver ? solverLabel(e.solver) : '—'}; {t('algo.history.coreLabel')} {e.coreVersion};{' '}
              {t('algo.chrome.ms', { n: e.durationMs })}
            </p>
          </div>
          {e.status === 'INFEASIBLE' && (
            <Notice tone="error" title={t('algo.history.infeasibleTitle')}>
              {e.headline}
            </Notice>
          )}
          {e.type === 'THRESHOLD' && (
            <Panel title={t('algo.result')}>
              <ThresholdSummary result={e.result as ThresholdOptimizeResponse} />
            </Panel>
          )}
          {e.type === 'FACTOR_SELECTION' && e.status === 'OK' && (
            <>
              <Panel title={t('algo.result')}>
                <FactorSelectionSummary
                  result={e.result as FactorSelectionResponse}
                  factorNames={Object.fromEntries(
                    ((e.input as { factors?: { code: string; name: string }[] }).factors ?? []).map((f) => [
                      f.code,
                      f.name,
                    ]),
                  )}
                />
              </Panel>
              <Panel title={t('algo.factors.rankingTitle')}>
                <FactorRankingChart ranking={(e.result as FactorSelectionResponse).ranking} />
              </Panel>
            </>
          )}
          {e.type === 'BUDGET_SWEEP' && (
            <Panel title={t('algo.factors.sensitivityTitle')}>
              <BudgetSensitivity
                result={{
                  experimentId: e.id,
                  meta: { coreVersion: e.coreVersion, durationMs: e.durationMs },
                  ...(e.result as Omit<BudgetSweepResponse, 'experimentId' | 'meta'>),
                }}
              />
            </Panel>
          )}
          <Panel
            title={t('algo.history.inputOutput')}
            actions={<ExportButtons spec={{ baseName: `experiment-${e.id.slice(0, 8)}`, json: e }} />}
          >
            <details>
              <summary className="text-graphite cursor-pointer text-sm">{t('algo.history.jsonShow')}</summary>
              <pre className="num max-h-120 bg-paper mt-3 overflow-auto rounded-md p-4 text-xs">
                {JSON.stringify({ input: e.input, result: e.result }, null, 2)}
              </pre>
            </details>
          </Panel>
        </>
      )}
    </div>
  );
}
