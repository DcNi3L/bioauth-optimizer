import { ProblemTooLargeError } from '../../errors';
import { CONSTRAINT_KINDS, SubsetEvaluator, compareSubsets, indicesFromMask } from '../subset-evaluator';
import type { ConstraintKind, FactorSelectionProblem, SelectionResult, SolveOptions, SubsetMetrics } from '../types';
import { TopK } from '../top-k';
import { validateProblem } from '../validation';
import { type FactorSelectionSolver, resolveRankingLimit } from './factor-selection-solver';

export const EXHAUSTIVE_MAX_FACTORS = 20;

/**
 * Решатель A (док. 02, §2.2.2): полный перебор 2ⁿ − 1 непустых подмножеств с точной нелинейной E(x).
 * Эталон точности. Для каждой маски метрики считаются заново в фиксированном порядке индексов —
 * без накопления погрешности при инкрементальных обновлениях.
 */
export class ExhaustiveSolver implements FactorSelectionSolver {
  readonly id = 'exhaustive' as const;
  readonly maxFactors = EXHAUSTIVE_MAX_FACTORS;

  async solve(problem: FactorSelectionProblem, options?: SolveOptions): Promise<SelectionResult> {
    return this.solveSync(problem, options);
  }

  solveSync(problem: FactorSelectionProblem, options?: SolveOptions): SelectionResult {
    validateProblem(problem);
    const n = problem.factors.length;
    if (n > this.maxFactors) {
      throw new ProblemTooLargeError(`полный перебор поддерживает не более ${this.maxFactors} факторов (передано ${n})`);
    }
    const limit = resolveRankingLimit(options);
    const evaluator = new SubsetEvaluator(problem);
    const total = 2 ** n - 1;
    const rejectedBy: Record<ConstraintKind, number> = { latency: 0, budget: 0, pad: 0, far: 0 };
    const codeOf = (i: number) => problem.factors[i]!.code;
    const top = new TopK<SubsetMetrics>(limit, (a, b) => compareSubsets(a, b, codeOf));
    let feasibleCount = 0;

    for (let mask = 1; mask <= total; mask++) {
      const m = evaluator.evaluate(indicesFromMask(mask, n));
      const v = evaluator.violations(m);
      let ok = true;
      for (const k of CONSTRAINT_KINDS) {
        if (v[k]) {
          rejectedBy[k]++;
          ok = false;
        }
      }
      if (ok) {
        feasibleCount++;
        top.offer(m);
      }
    }

    const ranking = top.toArray().map((m) => evaluator.toSolution(m));

    return {
      status: ranking.length > 0 ? 'optimal' : 'infeasible',
      optimum: ranking[0] ?? null,
      ranking,
      rankingComplete: feasibleCount <= limit,
      stats: { factorsCount: n, subsetsTotal: total, feasibleCount, rejectedBy },
      solver: { used: 'exhaustive', certificate: null },
    };
  }
}
