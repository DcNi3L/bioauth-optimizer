import type { Factor, FusionRuleId } from '../types';

export interface FusedErrorRates {
  readonly far: number;
  readonly logFar: number;
  readonly frr: number;
}

/** Правило объединения решений факторов (OCP: «ИЛИ», взвешенная сумма — новые реализации). */
export interface FusionRule {
  readonly id: FusionRuleId;
  prepare(factors: readonly Factor[]): PreparedFusion;
}

export interface PreparedFusion {
  /** indices — по возрастанию; порядок суммирования фиксирован ради детерминизма. */
  combine(indices: readonly number[]): FusedErrorRates;
}
