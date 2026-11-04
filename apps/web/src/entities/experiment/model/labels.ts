import type { ExperimentType } from '@bioauth/contracts';

export const EXPERIMENT_TYPE_LABELS: Record<ExperimentType, string> = {
  THRESHOLD: 'Порог',
  FACTOR_SELECTION: 'Состав факторов',
  BUDGET_SWEEP: 'Анализ бюджета',
};

export const SOLVER_LABELS: Record<string, string> = {
  'gaussian-analytic': 'аналитически (нормальные)',
  'empirical-sweep': 'перебор по данным',
  exhaustive: 'полный перебор',
  ilp: 'ЦЛП (HiGHS)',
};
