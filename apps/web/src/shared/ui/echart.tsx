'use client';

import * as echarts from 'echarts';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';

export interface EChartHandle {
  /** PNG графика (для экспорта). */
  toDataUrl(): string | null;
}

/** Обёртка ECharts: инициализация, обновление опций, адаптация к ширине контейнера. */
export const EChart = forwardRef<
  EChartHandle,
  { option: echarts.EChartsCoreOption; height?: number; ariaLabel: string }
>(function EChart({ option, height = 360, ariaLabel }, ref) {
  const el = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);

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
    chart.current?.setOption(option, { notMerge: true });
  }, [option]);

  useImperativeHandle(ref, () => ({
    toDataUrl: () =>
      chart.current?.getDataURL({ type: 'png', pixelRatio: 2, backgroundColor: '#ffffff' }) ?? null,
  }));

  return <div ref={el} role="img" aria-label={ariaLabel} style={{ height, width: '100%' }} />;
});
