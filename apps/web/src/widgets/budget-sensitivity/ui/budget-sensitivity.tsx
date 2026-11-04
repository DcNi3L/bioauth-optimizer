'use client';

import type { BudgetSweepResponse } from '@bioauth/contracts';
import { useMemo } from 'react';

import { SERIES_COLORS } from '@/shared/config';
import { formatNumber } from '@/shared/lib';
import { EChart } from '@/shared/ui';

/** Оптимум E*(B) в зависимости от бюджета и точки смены оптимального набора. */
export function BudgetSensitivity({ result }: { result: BudgetSweepResponse }) {
  const option = useMemo(
    () => ({
      animation: false,
      grid: { left: 64, right: 24, top: 24, bottom: 48 },
      tooltip: {
        trigger: 'axis',
        formatter: (ps: { dataIndex: number }[]) => {
          const p = result.points[ps[0]!.dataIndex]!;
          return `B = ${formatNumber(p.budget, 3)}<br/>${p.codes ? `${p.codes.join(' + ')}, E = ${formatNumber(p.objective, 6)}` : 'нет допустимых наборов'}`;
        },
      },
      xAxis: {
        type: 'value',
        name: 'Бюджет B',
        nameLocation: 'middle',
        nameGap: 30,
        min: result.points[0]?.budget,
        max: result.points[result.points.length - 1]?.budget,
        axisLabel: { color: SERIES_COLORS.graphite, formatter: (v: number) => formatNumber(v, 2) },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        name: 'Лучший E*',
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
    [result],
  );

  return (
    <div className="flex flex-col gap-4">
      <EChart option={option} height={300} ariaLabel="Зависимость оптимума от бюджета" />
      <table className="data-table">
        <thead>
          <tr>
            <th>С бюджета</th>
            <th>Оптимальный набор</th>
            <th className="r">E*</th>
            <th className="r">Эффект роста бюджета</th>
          </tr>
        </thead>
        <tbody>
          {result.breakpoints.map((b) => (
            <tr key={b.budget}>
              <td className="num">{formatNumber(b.budget, 3)}</td>
              <td>{b.codes ? b.codes.join(' + ') : <span className="text-graphite">нет допустимых</span>}</td>
              <td className="num r">{formatNumber(b.objective, 6)}</td>
              <td className="num r">
                {b.ratioToPrevious === null
                  ? '—'
                  : b.ratioToPrevious <= 1
                    ? `потери ниже в ${formatNumber(1 / b.ratioToPrevious, 2)} раза`
                    : `потери выше в ${formatNumber(b.ratioToPrevious, 2)} раза`}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
