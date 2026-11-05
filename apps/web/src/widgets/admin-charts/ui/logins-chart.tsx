'use client';

import type { AdminStatsDto } from '@bioauth/contracts';
import { useMemo } from 'react';

import { SERIES_COLORS } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { EChart } from '@/shared/ui';

/** Успешные входы и отказы по дням: столбцы с накоплением (зелёный — успех, малиновый — отказ). */
export function LoginsChart({ days }: { days: AdminStatsDto['logins']['byDay'] }) {
  const t = useT();
  const f = useFormat();
  const option = useMemo(
    () => ({
      grid: { left: 36, right: 12, top: 36, bottom: 28 },
      legend: {
        top: 0,
        right: 0,
        itemWidth: 10,
        itemHeight: 10,
        textStyle: { color: SERIES_COLORS.graphite },
      },
      tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } },
      xAxis: {
        type: 'category',
        data: days.map((d) =>
          new Date(`${d.day}T00:00:00`).toLocaleDateString(f.tag, { day: 'numeric', month: 'short' }),
        ),
        axisLabel: { color: SERIES_COLORS.graphite, fontSize: 11 },
        axisLine: { lineStyle: { color: SERIES_COLORS.rule } },
        axisTick: { show: false },
      },
      yAxis: {
        type: 'value',
        minInterval: 1,
        axisLabel: { color: SERIES_COLORS.graphite, fontSize: 11 },
        splitLine: { lineStyle: { color: SERIES_COLORS.rule } },
      },
      series: [
        {
          name: t('admin.dash.success'),
          type: 'bar',
          stack: 'n',
          barMaxWidth: 26,
          itemStyle: { color: SERIES_COLORS.optimum },
          data: days.map((d) => d.success),
        },
        {
          name: t('admin.dash.failure'),
          type: 'bar',
          stack: 'n',
          barMaxWidth: 26,
          itemStyle: { color: SERIES_COLORS.far, borderRadius: [3, 3, 0, 0] },
          data: days.map((d) => d.failure),
        },
      ],
    }),
    [days, t, f.tag],
  );
  return <EChart option={option} height={260} ariaLabel={t('admin.dash.loginsChart')} />;
}

/** Горизонтальные полосы долей — компактно и без библиотеки. */
export function ShareBars({
  rows,
  tone = 'frr',
}: {
  rows: { label: string; value: number }[];
  tone?: 'frr' | 'far' | 'optimum' | 'ink';
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const bar = { frr: 'bg-frr', far: 'bg-far', optimum: 'bg-optimum', ink: 'bg-ink' }[tone];
  return (
    <ul className="flex flex-col gap-2.5">
      {rows.map((r) => (
        <li key={r.label} className="flex flex-col gap-1">
          <div className="flex items-baseline justify-between gap-2 text-sm">
            <span className="truncate">{r.label}</span>
            <span className="num text-graphite">{r.value}</span>
          </div>
          <div className="bg-paper h-1.5 overflow-hidden rounded-full">
            <div className={`h-full rounded-full ${bar}`} style={{ width: `${(r.value / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}
