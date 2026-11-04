'use client';

import { forwardRef, useMemo } from 'react';
import type { SubsetSolutionDto } from '@bioauth/contracts';
import { SERIES_COLORS } from '@/shared/config';
import { formatMs, formatNumber, formatPercent, formatSci } from '@/shared/lib';
import { EChart, type EChartHandle } from '@/shared/ui';

const MAX_BARS = 15;

/** Рейтинг допустимых наборов по критерию E (как рис. 2б СРО1); оптимум выделен. */
export const FactorRankingChart = forwardRef<EChartHandle, { ranking: readonly SubsetSolutionDto[] }>(function FactorRankingChart(
  { ranking },
  ref,
) {
  const shown = ranking.slice(0, MAX_BARS);
  const option = useMemo(() => {
    const rows = [...shown].reverse();
    return {
      animation: false,
      grid: { left: 150, right: 120, top: 8, bottom: 40 },
      tooltip: {
        trigger: 'item',
        formatter: (p: { dataIndex: number }) => {
          const s = rows[p.dataIndex]!;
          return `<b>${s.codes.join(' + ')}</b><br/>E = ${formatNumber(s.objective, 6)}<br/>FAR ${formatSci(s.far, 2)}, FRR ${formatPercent(
            s.frr,
            3,
          )}<br/>${formatMs(s.latencyMs)}, стоимость ${formatNumber(s.cost, 3)}`;
        },
      },
      xAxis: {
        type: 'value',
        name: 'Критерий E',
        nameLocation: 'middle',
        nameGap: 26,
        axisLabel: { color: SERIES_COLORS.graphite, formatter: (v: number) => formatNumber(v, 3) },
        splitLine: { lineStyle: { color: SERIES_COLORS.rule } },
      },
      yAxis: {
        type: 'category',
        data: rows.map((s) => s.codes.join(' + ')),
        axisLabel: { color: SERIES_COLORS.cost },
        axisTick: { show: false },
      },
      series: [
        {
          type: 'bar',
          barMaxWidth: 22,
          data: rows.map((s, i) => ({
            value: s.objective,
            itemStyle: { color: i === rows.length - 1 ? SERIES_COLORS.optimum : '#b9c0b8', borderRadius: [0, 3, 3, 0] },
          })),
          label: {
            show: true,
            position: 'right',
            color: SERIES_COLORS.graphite,
            formatter: (p: { dataIndex: number }) => {
              const s = rows[p.dataIndex]!;
              return `${formatNumber(s.objective, 4)} (${formatMs(s.latencyMs)}; ${formatNumber(s.cost, 2)})`;
            },
          },
        },
      ],
    };
  }, [shown]);
  return <EChart ref={ref} option={option} height={Math.max(160, shown.length * 34 + 60)} ariaLabel="Рейтинг допустимых наборов факторов" />;
});
