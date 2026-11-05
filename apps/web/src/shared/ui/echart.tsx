'use client';

import * as echarts from 'echarts';
import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';

import { useTheme } from '../theme';

export interface EChartHandle {
  /** PNG графика (для экспорта). */
  toDataUrl(): string | null;
}

/**
 * Цвета графиков заданы для светлой бумаги (SERIES_COLORS). В тёмной теме те же роли получают более яркие
 * оттенки: подмена по таблице сохраняет смысл цвета (FAR — малиновый, FRR — синий) без правки каждого графика.
 */
const DARK: Record<string, string> = {
  '#b3263e': '#ef6a82',
  '#1e5f8c': '#6db1e2',
  '#17202b': '#e4e9ee',
  '#2e7d4f': '#5cc58c',
  '#9aa3ad': '#6f7b88',
  '#d5dbd4': '#27313b',
  '#56606d': '#96a1ad',
  '#b9c0b8': '#3a4652',
  '#8a5a00': '#e3b45a',
  '#ffffff': '#151c23',
  '#fbfcfa': '#151c23',
};

function remap(value: unknown): unknown {
  if (typeof value === 'string') return DARK[value.toLowerCase()] ?? value;
  if (Array.isArray(value)) return value.map(remap);
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, remap(v)]));
  }
  return value;
}

/** Обёртка ECharts: инициализация, обновление опций, адаптация к ширине контейнера и к теме. */
export const EChart = forwardRef<
  EChartHandle,
  { option: echarts.EChartsCoreOption; height?: number; ariaLabel: string }
>(function EChart({ option, height = 360, ariaLabel }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const { resolved } = useTheme();
  const themed = useMemo(
    () => (resolved === 'dark' ? { textStyle: { color: '#96a1ad' }, ...(remap(option) as object) } : option),
    [option, resolved],
  );

  useEffect(() => {
    if (!el.current) return;
    const instance = echarts.init(el.current, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const ro = new ResizeObserver(() => instance.resize());
    ro.observe(el.current);
    return () => {
      ro.disconnect();
      instance.dispose();
      chart.current = null;
    };
  }, []);

  useEffect(() => {
    chart.current?.setOption(themed, { notMerge: true });
  }, [themed]);

  useImperativeHandle(ref, () => ({
    // Экспорт всегда в светлой палитре — для отчёта на белой бумаге.
    toDataUrl: () => {
      const c = chart.current;
      if (!c) return null;
      if (resolved === 'dark') c.setOption(option, { notMerge: true });
      const url = c.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' });
      if (resolved === 'dark') c.setOption(themed, { notMerge: true });
      return url;
    },
  }));

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ height, width: '100%' }} />;
});
