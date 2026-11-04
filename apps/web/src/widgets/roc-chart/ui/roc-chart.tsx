'use client';

import type { ThresholdOptimizeResponse } from '@bioauth/contracts';
import { useMemo } from 'react';

import { SERIES_COLORS } from '@/shared/config';
import { formatPercent, formatSci } from '@/shared/lib';
import { EChart } from '@/shared/ui';

/** ROC-кривая: TAR против FAR (логарифмическая шкала FAR) с рабочими точками. */
export function RocChart({ result }: { result: ThresholdOptimizeResponse }) {
  const option = useMemo(() => {
    const data = result.curves.roc.filter((p) => p.far > 1e-300).map((p) => [p.far, p.tar]);
    const point = (name: string, far: number, frr: number, color: string) => ({
      name,
      coord: [Math.max(far, 1e-300), 1 - frr],
      itemStyle: { color },
      label: { show: true, formatter: name, position: 'right', color },
    });
    const markers = [];
    if (result.eer.tau !== null)
      markers.push(point('EER', result.eer.far, result.eer.frr, SERIES_COLORS.graphite));
    if (result.optimal.tau !== null && result.optimal.far > 0) {
      markers.push(point('τ*', result.optimal.far, result.optimal.frr, SERIES_COLORS.optimum));
    }
    const axisLabel = { color: SERIES_COLORS.graphite };
    return {
      animation: false,
      grid: { left: 64, right: 32, top: 16, bottom: 48 },
      tooltip: {
        trigger: 'item',
        formatter: (p: { value: [number, number] }) =>
          `FAR ${formatSci(p.value[0], 3)}<br/>TAR ${formatPercent(p.value[1], 3)}`,
      },
      xAxis: {
        type: 'log',
        name: 'FAR',
        nameLocation: 'middle',
        nameGap: 30,
        axisLabel: { ...axisLabel, formatter: (v: number) => formatSci(v, 1) },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'TAR = 1 − FRR',
        nameLocation: 'middle',
        nameGap: 46,
        max: 1,
        axisLabel: { ...axisLabel, formatter: (v: number) => formatPercent(v, 0) },
        splitLine: { lineStyle: { color: SERIES_COLORS.rule } },
      },
      series: [
        {
          type: 'line',
          showSymbol: false,
          data,
          lineStyle: { color: SERIES_COLORS.frr, width: 2 },
          markPoint: { symbol: 'circle', symbolSize: 9, data: markers },
        },
      ],
    };
  }, [result]);
  return <EChart option={option} height={300} ariaLabel="ROC-кривая" />;
}
