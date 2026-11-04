import type { ExperimentRecord } from './experiment.repository';

const fmt = (x: number, digits = 4) => x.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/** Короткая сводка результата для таблицы истории. */
export function experimentHeadline(e: Pick<ExperimentRecord, 'type' | 'status' | 'result'>): string {
  const r = e.result as Record<string, any>;
  try {
    if (e.type === 'THRESHOLD') {
      const opt = r.optimal;
      if (opt.degenerate === 'acceptAll') return 'Вырожденный оптимум: допускать всех';
      if (opt.degenerate === 'rejectAll') return 'Вырожденный оптимум: отвергать всех';
      const delta = r.lossReduction === null ? '' : `, Δ = ${fmt(r.lossReduction * 100, 1)} %`;
      return `τ* = ${fmt(opt.tau)}, E = ${fmt(opt.cost, 6)}${delta}`;
    }
    if (e.type === 'FACTOR_SELECTION') {
      if (e.status === 'INFEASIBLE' || !r.optimum) return 'Нет допустимых наборов';
      return `${r.optimum.codes.join(' + ')}, E = ${fmt(r.optimum.objective, 6)}`;
    }
    const changes = Math.max(0, (r.breakpoints?.length ?? 1) - 1);
    return `Перебор бюджета: ${r.points?.length ?? 0} точек, смен оптимума — ${changes}`;
  } catch {
    return '—';
  }
}
