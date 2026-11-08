'use client';

import type { ThresholdOptimizeResponse } from '@bioauth/contracts';
import { forwardRef, useMemo } from 'react';

import { SERIES_COLORS } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { formatNumber, formatSci } from '@/shared/lib';
import { EChart, type EChartHandle } from '@/shared/ui';

const positive = (v: number) => (v > 1e-300 ? v : null);

/** FAR(τ), FRR(τ) и E(τ) на логарифмической шкале с отметками EER и τ* (как рис. 2а СРО1). */
export const ThresholdErrorChart = forwardRef<EChartHandle, { result: ThresholdOptimizeResponse }>(
  function ThresholdErrorChart({ result }, ref) {
    const t = useT();
    const xAxisLabel = t('algo.threshold.xAxis');
    const yAxisLabel = t('algo.threshold.yAxis');
    const ariaLabel = t('algo.threshold.ariaErrors');
    const option = useMemo(() => {
      const pts = result.curves.errors;
      const line = (key: 'far' | 'frr' | 'cost') => pts.map((p) => [p.tau, positive(p[key])]);
      const marks: { xAxis: number; name: string; lineStyle: object; label: object }[] = [];
      if (result.eer.tau !== null) {
        marks.push({
          xAxis: result.eer.tau,
          name: 'EER',
          lineStyle: { color: SERIES_COLORS.graphite, type: 'dotted', width: 1 },
          label: {
            formatter: `EER\nτ = ${formatNumber(result.eer.tau)}`,
            color: SERIES_COLORS.graphite,
            position: 'insideEndTop',
          },
        });
      }
      if (result.optimal.tau !== null) {
        marks.push({
          xAxis: result.optimal.tau,
          name: 'τ*',
          lineStyle: { color: SERIES_COLORS.optimum, type: 'solid', width: 1.5 },
          label: {
            formatter: `τ* = ${formatNumber(result.optimal.tau)}`,
            color: SERIES_COLORS.optimum,
            position: 'insideEndTop',
            fontWeight: 600,
          },
        });
      }
      const points = [
        result.eer.tau !== null && {
          coord: [result.eer.tau, result.eer.cost],
          itemStyle: { color: SERIES_COLORS.graphite },
        },
        result.optimal.tau !== null && {
          coord: [result.optimal.tau, result.optimal.cost],
          itemStyle: { color: SERIES_COLORS.optimum },
        },
      ].filter(Boolean);
      const axisLabel = { color: SERIES_COLORS.graphite, fontFamily: 'Golos Text Variable, sans-serif' };
      return {
        animation: false,
        textStyle: { fontFamily: 'Golos Text Variable, sans-serif' },
        grid: { left: 64, right: 24, top: 40, bottom: 48 },
        legend: { top: 4, left: 'center', itemWidth: 22, textStyle: { color: SERIES_COLORS.cost } },
        tooltip: {
          trigger: 'axis',
          valueFormatter: (v: number | null) => (v === null ? '—' : formatSci(v, 3)),
          axisPointer: { type: 'line', lineStyle: { color: SERIES_COLORS.muted } },
        },
        xAxis: {
          type: 'value',
          name: xAxisLabel,
          nameLocation: 'middle',
          nameGap: 30,
          min: pts[0]?.tau,
          max: pts[pts.length - 1]?.tau,
          axisLabel: { ...axisLabel, formatter: (v: number) => formatNumber(v, 3) },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'log',
          logBase: 10,
          name: yAxisLabel,
          nameLocation: 'middle',
          nameGap: 50,
          axisLabel: { ...axisLabel, formatter: (v: number) => formatSci(v, 1) },
          splitLine: { lineStyle: { color: SERIES_COLORS.rule } },
        },
        series: [
          {
            name: 'FAR(τ)',
            type: 'line',
            showSymbol: false,
            data: line('far'),
            lineStyle: { color: SERIES_COLORS.far, width: 2 },
            itemStyle: { color: SERIES_COLORS.far },
          },
          {
            name: 'FRR(τ)',
            type: 'line',
            showSymbol: false,
            data: line('frr'),
            lineStyle: { color: SERIES_COLORS.frr, width: 2 },
            itemStyle: { color: SERIES_COLORS.frr },
          },
          {
            name: 'E(τ) = cFA·FAR + cFR·FRR',
            type: 'line',
            showSymbol: false,
            data: line('cost'),
            lineStyle: { color: SERIES_COLORS.cost, width: 2, type: 'dashed' },
            itemStyle: { color: SERIES_COLORS.cost },
            markLine: { symbol: 'none', silent: true, data: marks },
            markPoint: { symbol: 'circle', symbolSize: 9, label: { show: false }, data: points },
          },
        ],
      };
    }, [result, xAxisLabel, yAxisLabel]);

    return <EChart ref={ref} option={option} height={400} ariaLabel={ariaLabel} />;
  },
);
