import type { ExperimentRecord } from './experiment.repository';

const fmt = (x: number, digits = 4) => x.toLocaleString('ru-RU', { maximumFractionDigits: digits });

/** Минимальные формы сохранённых результатов, нужные для сводки (полные — в @bioauth/contracts). */
interface ThresholdSummary {
  optimal: { tau: number | null; cost: number; degenerate: 'acceptAll' | 'rejectAll' | null };
  lossReduction: number | null;
}
interface SelectionSummary {
  optimum: { codes: string[]; objective: number } | null;
}
interface SweepSummary {
  points?: unknown[];
  breakpoints?: unknown[];
}

/** Короткая сводка результата для таблицы истории. */
export function experimentHeadline(e: Pick<ExperimentRecord, 'type' | 'status' | 'result'>): string {
  try {
    switch (e.type) {
      case 'THRESHOLD': {
        const r = e.result as ThresholdSummary;
        const opt = r.optimal;
        if (opt.degenerate === 'acceptAll') return 'Вырожденный оптимум: допускать всех';
        if (opt.degenerate === 'rejectAll' || opt.tau === null) return 'Вырожденный оптимум: отвергать всех';
        const delta = r.lossReduction === null ? '' : `, Δ = ${fmt(r.lossReduction * 100, 1)} %`;
        return `τ* = ${fmt(opt.tau)}, E = ${fmt(opt.cost, 6)}${delta}`;
      }
      case 'FACTOR_SELECTION': {
        const r = e.result as SelectionSummary;
        if (e.status === 'INFEASIBLE' || !r.optimum) return 'Нет допустимых наборов';
        return `${r.optimum.codes.join(' + ')}, E = ${fmt(r.optimum.objective, 6)}`;
      }
      case 'BUDGET_SWEEP': {
        const r = e.result as SweepSummary;
        const changes = Math.max(0, (r.breakpoints?.length ?? 1) - 1);
        return `Перебор бюджета: ${r.points?.length ?? 0} точек, смен оптимума — ${changes}`;
      }
    }
  } catch {
    return '—';
  }
}
