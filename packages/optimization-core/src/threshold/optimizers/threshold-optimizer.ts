import type { ThresholdResult } from '../types';

/** Стратегия поиска оптимального порога (OCP: новые модели оценок — новые реализации). */
export interface ThresholdOptimizer<TInput> {
  optimize(input: TInput): ThresholdResult;
}
