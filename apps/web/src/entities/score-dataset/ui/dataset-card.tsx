'use client';

import type { ScoreDatasetDto } from '@bioauth/contracts';
import { useMemo } from 'react';

import { SERIES_COLORS } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { formatNumber } from '@/shared/lib';
import { EChart, Metric } from '@/shared/ui';

/** Сводка загруженного набора оценок: объёмы выборок и гистограмма двух распределений. */
export function DatasetCard({ dataset }: { dataset: ScoreDatasetDto }) {
  const t = useT();
  const option = useMemo(() => {
    const { edges, genuine, impostor } = dataset.histogram;
    const centers = edges.slice(0, -1).map((e, i) => (e + edges[i + 1]!) / 2);
    return {
      animation: false,
      grid: { left: 40, right: 12, top: 24, bottom: 28 },
      legend: { top: 0, right: 0, textStyle: { color: SERIES_COLORS.graphite } },
      tooltip: { trigger: 'axis' },
      xAxis: {
        type: 'category',
        data: centers.map((c) => formatNumber(c, 3)),
        axisLabel: { color: SERIES_COLORS.graphite },
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: SERIES_COLORS.graphite },
        splitLine: { lineStyle: { color: SERIES_COLORS.rule } },
      },
      series: [
        {
          name: t('algo.chrome.genuine'),
          type: 'bar',
          data: genuine,
          itemStyle: { color: SERIES_COLORS.frr, opacity: 0.75 },
          barGap: '-100%',
        },
        {
          name: t('algo.chrome.impostors'),
          type: 'bar',
          data: impostor,
          itemStyle: { color: SERIES_COLORS.far, opacity: 0.6 },
        },
      ],
    };
  }, [dataset, t]);

  return (
    <div className="border-rule bg-paper flex flex-col gap-3 rounded-md border p-4">
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <Metric label={t('algo.chrome.dataset')} value={dataset.name} />
        <Metric
          label={t('algo.chrome.genuine')}
          value={dataset.genuineCount.toLocaleString('ru-RU')}
          tone="frr"
        />
        <Metric
          label={t('algo.chrome.impostors')}
          value={dataset.impostorCount.toLocaleString('ru-RU')}
          tone="far"
        />
        <Metric
          label={t('algo.chrome.scoreRange')}
          value={`${formatNumber(dataset.min)} … ${formatNumber(dataset.max)}`}
        />
      </div>
      <EChart option={option} height={160} ariaLabel={t('algo.chrome.histAria')} />
    </div>
  );
}
