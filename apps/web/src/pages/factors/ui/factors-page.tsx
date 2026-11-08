'use client';

import type { FactorSelectionResponse } from '@bioauth/contracts';
import { useRef, useState } from 'react';

import { CatalogPicker, SaveCatalogForm } from '@/features/edit-factor-catalog';
import { ExportButtons } from '@/features/export-result';
import { LoadExampleButton } from '@/features/load-article-example';
import { BudgetSweepControls, useBudgetSweep } from '@/features/run-budget-sweep';
import {
  FactorTableEditor,
  SelectionSettingsForm,
  useFactorSelectionForm,
  useSolveFactors,
} from '@/features/select-factors';
import { ApiError } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { formatNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, type EChartHandle, Notice, Panel } from '@/shared/ui';
import { BudgetSensitivity } from '@/widgets/budget-sensitivity';
import { FactorRankingChart } from '@/widgets/factor-ranking-chart';
import { FactorSelectionSummary } from '@/widgets/factor-selection-summary';

function rankingCsv(r: FactorSelectionResponse) {
  return {
    header: ['rank', 'codes', 'E', 'FAR', 'FRR', 'latencyMs', 'cost'],
    rows: r.ranking.map((s, i) => [i + 1, s.codes.join('+'), s.objective, s.far, s.frr, s.latencyMs, s.cost]),
  };
}

export function FactorsPage() {
  const t = useT();
  const form = useFactorSelectionForm();
  const solve = useSolveFactors();
  const sweep = useBudgetSweep();
  const [result, setResult] = useState<FactorSelectionResponse | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const chartRef = useRef<EChartHandle>(null);

  const REJECT_BY_LABELS: Record<string, string> = {
    latency: t('algo.factors.rejectByLatency'),
    budget: t('algo.factors.rejectByBudget'),
    pad: t('algo.factors.rejectByPad'),
    far: t('algo.factors.rejectByFar'),
  };

  const submit = () => {
    const req = form.build();
    if (!req) return;
    setNames(Object.fromEntries(req.factors!.map((f) => [f.code, f.name])));
    solve.mutate(req, { onSuccess: setResult, onError: () => setResult(null) });
  };

  const infeasible =
    solve.error instanceof ApiError && solve.error.status === 422 ? solve.error.problem : null;
  const rejectedText = infeasible?.rejectedBy
    ? Object.entries(infeasible.rejectedBy)
        .filter(([, v]) => v > 0)
        .sort((a, b) => b[1] - a[1])
        .map(([k, v]) => `${REJECT_BY_LABELS[k] ?? k} — ${v}`)
        .join(', ')
    : null;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">{t('algo.factors.title')}</h2>
          <p className="text-graphite mt-1 max-w-prose text-sm">{t('algo.factors.subtitle')}</p>
        </div>
        <LoadExampleButton
          onLoad={(ex) => {
            form.fill(ex.factorSelection);
            setResult(null);
            solve.reset();
            sweep.reset();
          }}
        />
      </div>

      <Panel
        title={t('algo.factors.candidatesTitle')}
        description={t('algo.factors.candidatesDesc')}
        actions={
          <div className="w-72">
            <CatalogPicker onPick={(c) => form.setFactorDtos(c.factors)} />
          </div>
        }
      >
        <div className="flex flex-col gap-6">
          <FactorTableEditor form={form} />
          <div className="border-rule border-t pt-4">
            <SaveCatalogForm getFactors={form.currentFactorDtos} />
          </div>
        </div>
      </Panel>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)]">
        <Panel title={t('algo.factors.costsTitle')}>
          <form
            className="flex flex-col gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
          >
            <SelectionSettingsForm form={form} />
            <div className="border-rule border-t pt-4">
              <Button type="submit" busy={solve.isPending}>
                {t('algo.factors.solve')}
              </Button>
            </div>
          </form>
        </Panel>

        <div className="flex flex-col gap-6" aria-live="polite">
          {infeasible ? (
            <Notice tone="error" title={t('algo.factors.infeasibleTitle')}>
              {rejectedText ? t('algo.factors.infeasibleText', { reasons: rejectedText }) : infeasible.detail}
            </Notice>
          ) : (
            <ApiErrorNotice error={solve.error} />
          )}
          {!result && !solve.error && (
            <div className="border-rule text-graphite rounded-lg border border-dashed px-6 py-16 text-center text-sm">
              {t('algo.factors.placeholder')}
            </div>
          )}
          {result && (
            <>
              <Panel title={t('algo.result')}>
                <FactorSelectionSummary result={result} factorNames={names} />
              </Panel>
              <Panel
                title={t('algo.factors.rankingTitle')}
                description={
                  result.rankingComplete
                    ? t('algo.factors.rankingDescComplete', { n: result.ranking.length })
                    : t('algo.factors.rankingDescBest', { shown: Math.min(result.ranking.length, 15) })
                }
                actions={
                  <ExportButtons
                    spec={{
                      baseName: `factors-${result.experimentId.slice(0, 8)}`,
                      json: result,
                      csv: rankingCsv(result),
                      png: () => chartRef.current?.toDataUrl() ?? null,
                    }}
                  />
                }
              >
                <FactorRankingChart ref={chartRef} ranking={result.ranking} />
              </Panel>
            </>
          )}
        </div>
      </div>

      <Panel title={t('algo.factors.sensitivityTitle')} description={t('algo.factors.sensitivityDesc')}>
        <div className="flex flex-col gap-5">
          <BudgetSweepControls
            buildBase={form.buildSweepBase}
            onRun={(req) => sweep.mutate(req)}
            busy={sweep.isPending}
          />
          <ApiErrorNotice error={sweep.error} />
          {sweep.data && (
            <>
              <BudgetSensitivity result={sweep.data} />
              <p className="text-graphite text-xs">
                {t('algo.factors.points', { n: sweep.data.points.length })};{' '}
                {t('algo.factors.breaks', { n: Math.max(0, sweep.data.breakpoints.length - 1) })};{' '}
                {t('algo.factors.duration', { ms: formatNumber(sweep.data.meta.durationMs, 0) })}
              </p>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
