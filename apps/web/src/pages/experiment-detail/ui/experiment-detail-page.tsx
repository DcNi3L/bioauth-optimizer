'use client';

import type {
  BudgetSweepResponse,
  FactorSelectionResponse,
  ThresholdOptimizeResponse,
} from '@bioauth/contracts';
import Link from 'next/link';

import { EXPERIMENT_TYPE_LABELS, SOLVER_LABELS, useExperiment } from '@/entities/experiment';
import { ExportButtons } from '@/features/export-result';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Notice, Panel } from '@/shared/ui';
import { BudgetSensitivity } from '@/widgets/budget-sensitivity';
import { FactorRankingChart } from '@/widgets/factor-ranking-chart';
import { FactorSelectionSummary } from '@/widgets/factor-selection-summary';
import { ThresholdSummary } from '@/widgets/threshold-summary';

export function ExperimentDetailPage({ id }: { id: string }) {
  const q = useExperiment(id);
  const e = q.data;
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
      <Link href="/experiments" className="text-frr w-fit text-sm hover:underline">
        К истории
      </Link>
      <ApiErrorNotice error={q.error} />
      {e && (
        <>
          <div>
            <h1 className="text-2xl">{EXPERIMENT_TYPE_LABELS[e.type]}</h1>
            <p className="text-graphite mt-1 text-sm">
              {formatDateTime(e.createdAt)}; метод: {e.solver ? (SOLVER_LABELS[e.solver] ?? e.solver) : '—'};
              ядро {e.coreVersion}; {e.durationMs} мс
            </p>
          </div>
          {e.status === 'INFEASIBLE' && (
            <Notice tone="error" title="Допустимых решений не было">
              {e.headline}
            </Notice>
          )}
          {e.type === 'THRESHOLD' && (
            <Panel title="Результат">
              <ThresholdSummary result={e.result as ThresholdOptimizeResponse} />
            </Panel>
          )}
          {e.type === 'FACTOR_SELECTION' && e.status === 'OK' && (
            <>
              <Panel title="Результат">
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
              <Panel title="Допустимые наборы по критерию E">
                <FactorRankingChart ranking={(e.result as FactorSelectionResponse).ranking} />
              </Panel>
            </>
          )}
          {e.type === 'BUDGET_SWEEP' && (
            <Panel title="Чувствительность к бюджету">
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
            title="Входные данные и полный результат"
            actions={<ExportButtons spec={{ baseName: `experiment-${e.id.slice(0, 8)}`, json: e }} />}
          >
            <details>
              <summary className="text-graphite cursor-pointer text-sm">Показать JSON</summary>
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
