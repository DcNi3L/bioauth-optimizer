'use client';

import type { ScoreDatasetDto, ThresholdOptimizeResponse } from '@bioauth/contracts';
import { useRef, useState } from 'react';

import { ExportButtons } from '@/features/export-result';
import { LoadExampleButton } from '@/features/load-article-example';
import { ThresholdForm, useOptimizeThreshold, useThresholdForm } from '@/features/optimize-threshold';
import { UploadScores } from '@/features/upload-scores';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, type EChartHandle, Panel } from '@/shared/ui';
import { RocChart } from '@/widgets/roc-chart';
import { ThresholdErrorChart } from '@/widgets/threshold-error-chart';
import { ThresholdSummary } from '@/widgets/threshold-summary';

function curvesCsv(r: ThresholdOptimizeResponse) {
  return {
    header: ['tau', 'FAR', 'FRR', 'E'],
    rows: r.curves.errors.map((p) => [p.tau, p.far, p.frr, p.cost]),
  };
}

export function ThresholdPage() {
  const t = useT();
  const form = useThresholdForm();
  const optimize = useOptimizeThreshold();
  const [dataset, setDataset] = useState<ScoreDatasetDto | null>(null);
  const [result, setResult] = useState<ThresholdOptimizeResponse | null>(null);
  const chartRef = useRef<EChartHandle>(null);

  const submit = () => {
    const req = form.build(dataset?.id ?? null);
    if (req) optimize.mutate(req, { onSuccess: setResult });
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <div className="flex flex-col gap-6">
        <div>
          <h2 className="text-xl">{t('algo.threshold.title')}</h2>
          <p className="text-graphite mt-1 max-w-prose text-sm">{t('algo.threshold.subtitle')}</p>
        </div>
        <Panel>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            className="flex flex-col gap-6"
          >
            <ThresholdForm
              values={form.values}
              errors={form.errors}
              set={form.set}
              datasetSlot={<UploadScores dataset={dataset} onUploaded={setDataset} />}
            />
            <div className="border-rule flex flex-wrap gap-3 border-t pt-4">
              <Button type="submit" busy={optimize.isPending}>
                {t('algo.calculate')}
              </Button>
              <LoadExampleButton onLoad={(ex) => form.fill(ex.threshold)} />
            </div>
            <ApiErrorNotice error={optimize.error} />
          </form>
        </Panel>
      </div>

      <div className="flex flex-col gap-6" aria-live="polite">
        {!result ? (
          <div className="border-rule text-graphite lg:mt-18 rounded-lg border border-dashed px-6 py-16 text-center text-sm">
            {t('algo.threshold.placeholder')}
          </div>
        ) : (
          <>
            <Panel title={t('algo.result')}>
              <ThresholdSummary result={result} />
            </Panel>
            <Panel
              title={t('algo.threshold.errorChartTitle')}
              actions={
                <ExportButtons
                  spec={{
                    baseName: `threshold-${result.experimentId.slice(0, 8)}`,
                    json: result,
                    csv: curvesCsv(result),
                    png: () => chartRef.current?.toDataUrl() ?? null,
                  }}
                />
              }
            >
              <ThresholdErrorChart ref={chartRef} result={result} />
            </Panel>
            <Panel title={t('algo.threshold.rocTitle')}>
              <RocChart result={result} />
            </Panel>
          </>
        )}
      </div>
    </div>
  );
}
