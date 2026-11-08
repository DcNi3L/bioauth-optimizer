'use client';

import type { BudgetSweepResponse } from '@bioauth/contracts';
import { useMemo } from 'react';

import { SERIES_COLORS } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { formatNumber } from '@/shared/lib';
import { EChart } from '@/shared/ui';

/** Оптимум E*(B) в зависимости от бюджета и точки смены оптимального набора. */
export function BudgetSensitivity({ result }: { result: BudgetSweepResponse }) {
  const t = useT();

  const budgetNoneLabel = t('algo.factors.budgetNone');
  const xAxisLabel = t('algo.factors.xAxisBudget');
  const yAxisLabel = t('algo.factors.yAxisBest');

  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 64, right: 24, top: 24, bottom: 48 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: { dataIndex: number }[]) => {
          const p = result.points[ps[0]!.dataIndex]!;
          return `B = ${formatNumber(p.budget, 3)}<br/>${p.codes ? `${p.codes.join(' + ')}, E = ${formatNumber(p.objective, 6)}` : budgetNoneLabel}`;
        },
      },
      xAxis: {
        type: 'value',
        name: xAxisLabel,
        nameLocation: 'middle',
        nameGap: 30,
        min: result.points[0]?.budget,
        max: result.points[result.points.length - 1]?.budget,
        axisLabel: { color: SERIES_COLORS.graphite, formatter: (v: number) => formatNumber(v, 2) },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: yAxisLabel,
        nameLocation: 'middle',
        nameGap: 48,
        axisLabel: { color: SERIES_COLORS.graphite, formatter: (v: number) => formatNumber(v, 3) },
        splitLine: { lineStyle: { color: SERIES_COLORS.rule } },
      },
      series: [
        {
          type: 'line',
          step: 'end',
          showSymbol: false,
          connectNulls: false,
          data: result.points.map((p) => [p.budget, p.objective]),
          lineStyle: { color: SERIES_COLORS.optimum, width: 2 },
          areaStyle: { color: 'rgba(46,125,79,0.07)' },
          markPoint: {
            symbol: 'circle',
            symbolSize: 8,
            itemStyle: { color: SERIES_COLORS.optimum },
            label: {
              show: true,
              position: 'top',
              color: SERIES_COLORS.cost,
              formatter: (p: { name: string }) => p.name,
            },
            data: result.breakpoints
              .filter((b) => b.codes)
              .map((b) => ({ name: b.codes!.join('+'), coord: [b.budget, b.objective] })),
          },
        },
      ],
    }),
    [result, budgetNoneLabel, xAxisLabel, yAxisLabel],
  );

  return (
    <div className="flex flex-col gap-4">
      <EChart option={option} height={300} ariaLabel={t('algo.factors.ariaSensitivity')} />
      <table className="data-table">
        <thead>
          <tr>
            <th>{t('algo.factors.budgetFrom')}</th>
            <th>{t('algo.factors.budgetOptimal')}</th>
            <th className="r">{t('algo.factors.budgetE')}</th>
            <th className="r">{t('algo.factors.budgetEffect')}</th>
          </tr>
        </thead>
        <tbody>
          {result.breakpoints.map((b) => (
            <tr key={b.budget}>
              <td className="num">{formatNumber(b.budget, 3)}</td>
              <td>
                {b.codes ? (
                  b.codes.join(' + ')
                ) : (
                  <span className="text-graphite">{t('algo.factors.budgetNone')}</span>
                )}
              </td>
              <td className="num r">{formatNumber(b.objective, 6)}</td>
              <td className="num r">
                {b.ratioToPrevious === null
                  ? '—'
                  : b.ratioToPrevious <= 1
                    ? t('algo.factors.lossLower', { x: formatNumber(1 / b.ratioToPrevious, 2) })
                    : t('algo.factors.lossHigher', { x: formatNumber(b.ratioToPrevious, 2) })}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
