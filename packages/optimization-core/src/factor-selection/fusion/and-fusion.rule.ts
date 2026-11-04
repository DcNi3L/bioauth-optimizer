import { expm1, log1p } from '../../numeric';
import type { Factor } from '../types';
import type { FusedErrorRates, FusionRule, PreparedFusion } from './fusion-rule';

/**
 * Правило «И» (СРО1, формула (2)): злоумышленник должен пройти все включённые факторы.
 * FAR = ∏ FAR_i, FRR = 1 − ∏(1 − FRR_i). Вычисление в лог-пространстве (ADR-0008).
 */
export class AndFusionRule implements FusionRule {
  readonly id = 'AND' as const;

  prepare(factors: readonly Factor[]): PreparedFusion {
    const logFar = factors.map((f) => Math.log(f.far));
    const logSurv = factors.map((f) => log1p(-f.frr));
    return {
      combine(indices: readonly number[]): FusedErrorRates {
        let lf = 0;
        let ls = 0;
        for (const i of indices) {
          lf += logFar[i]!;
          ls += logSurv[i]!;
        }
        // ls = 0 (все FRR_i = 0) → FRR = 0, а не −0.
        return { far: Math.exp(lf), logFar: lf, frr: ls === 0 ? 0 : -expm1(ls) };
      },
    };
  }
}
