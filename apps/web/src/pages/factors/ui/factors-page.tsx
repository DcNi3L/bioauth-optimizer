'use client';

import type { FactorSelectionResponse } from '@bioauth/contracts';
import { useMemo, useRef, useState } from 'react';

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
import { formatNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, type EChartHandle, Notice, Panel } from '@/shared/ui';
import { BudgetSensitivity } from '@/widgets/budget-sensitivity';
import { FactorRankingChart } from '@/widgets/factor-ranking-chart';
import { FactorSelectionSummary } from '@/widgets/factor-selection-summary';

const REJECT_LABELS: Record<string, string> = {
  latency: 'задержке',
  budget: 'бюджету',
  pad: 'наличию PAD',
  far: 'FAR',
};

function rankingCsv(r: FactorSelectionResponse) {
  return {
    header: ['rank', 'codes', 'E', 'FAR', 'FRR', 'latencyMs', 'cost'],
    rows: r.ranking.map((s, i) => [i + 1, s.codes.join('+'), s.objective, s.far, s.frr, s.latencyMs, s.cost]),
  };
}

export function FactorsPage() {
  const form = useFactorSelectionForm();
  const solve = useSolveFactors();
  const sweep = useBudgetSweep();
  const [result, setResult] = useState<FactorSelectionResponse | null>(null);
  const [names, setNames] = useState<Record<string, string>>({});
  const chartRef = useRef<EChartHandle>(null);

  const submit = () => {
    const req = form.build();
    if (!req) return;
    setNames(Object.fromEntries(req.factors!.map((f) => [f.code, f.name])));
    solve.mutate(req, { onSuccess: setResult, onError: () => setResult(null) });
  };

  const infeasible =
    solve.error instanceof ApiError && solve.error.status === 422 ? solve.error.problem : null;
  const rejectedText = useMemo(
    () =>
      infeasible?.rejectedBy
        ? Object.entries(infeasible.rejectedBy)
            .filter(([, v]) => v > 0)
            .sort((a, b) => b[1] - a[1])
            .map(([k, v]) => `по ${REJECT_LABELS[k] ?? k} — ${v}`)
            .join(', ')
        : null,
    [infeasible],
  );

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-xl">Состав факторов</h2>
          <p className="text-graphite mt-1 max-w-prose text-sm">
            Целочисленная задача (2)–(3) статьи СРО1: FAR = ∏FARᵢ, FRR = 1 − ∏(1 − FRRᵢ), задержка и стоимость
            складываются.
          </p>
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
        title="Кандидаты"
        description="FAR и FRR — вероятности (можно вводить 1e-4 или 0,02). Отметьте факторы с обнаружением атак на предъявление (PAD)."
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
        <Panel title="Стоимости и ограничения">
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
                Подобрать набор
              </Button>
            </div>
          </form>
        </Panel>

        <div className="flex flex-col gap-6" aria-live="polite">
          {infeasible ? (
            <Notice tone="error" title="Ни один набор не удовлетворяет ограничениям">
              {rejectedText
                ? `Чаще всего мешают ограничения: ${rejectedText}. Ослабьте самое жёсткое из них.`
                : infeasible.detail}
            </Notice>
          ) : (
            <ApiErrorNotice error={solve.error} />
          )}
          {!result && !solve.error && (
            <div className="border-rule text-graphite rounded-lg border border-dashed px-6 py-16 text-center text-sm">
              Заполните факторы и ограничения или нажмите «Пример из статьи СРО1». Здесь появятся оптимальный
              набор и рейтинг всех допустимых.
            </div>
          )}
          {result && (
            <>
              <Panel title="Результат">
                <FactorSelectionSummary result={result} factorNames={names} />
              </Panel>
              <Panel
                title="Допустимые наборы по критерию E"
                description={
                  result.rankingComplete
                    ? `Все ${result.ranking.length} допустимых наборов; меньше — лучше.`
                    : `Показаны ${Math.min(result.ranking.length, 15)} лучших из просмотренных; меньше — лучше.`
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

      <Panel
        title="Чувствительность к бюджету"
        description="Как меняется лучший набор, если бюджет B меняется, а остальные ограничения те же. Показывает цену ужесточения бюджета."
      >
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
                Точек: {sweep.data.points.length}; смен оптимума:{' '}
                {Math.max(0, sweep.data.breakpoints.length - 1)}; расчёт{' '}
                {formatNumber(sweep.data.meta.durationMs, 0)} мс.
              </p>
            </>
          )}
        </div>
      </Panel>
    </div>
  );
}
