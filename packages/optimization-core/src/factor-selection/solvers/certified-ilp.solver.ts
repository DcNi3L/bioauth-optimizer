import { EPS, expm1 } from '../../numeric';
import { SubsetEvaluator, compareSubsets } from '../subset-evaluator';
import { TopK } from '../top-k';
import type { FactorSelectionProblem, SelectionResult, SolveOptions, SubsetMetrics } from '../types';
import { MAX_FACTORS, validateProblem } from '../validation';
import { type FactorSelectionSolver, resolveRankingLimit } from './factor-selection-solver';
import type { MilpConstraint, MilpModel, MilpPort } from './milp-port';

/** Консервативный запас на численный допуск MILP при сравнении S(x̂) с найденным оптимумом. */
const S_SAFETY = 1e-9;
const DEFAULT_MAX_ITERATIONS = 10_000;

export interface CertifiedIlpOptions {
  readonly maxIterations?: number;
}

const slackRhs = (rhs: number) => rhs + EPS * Math.max(1, Math.abs(rhs));

/**
 * Решатель B (док. 02, §2.2.3) — метод СРО1: линеаризованное ЦЛП
 *   min S(x) = Σ FRR_i·x_i  при  Σ x_i·ln FAR_i ≤ ln FAR_max  и линейных ограничениях (3),
 * дополненное сертификатом оптимальности для исходной нелинейной E(x):
 *   E(x) ≥ cFR·(1 − e^{−S(x)}) =: LB(S),  поэтому перебор решений MILP в порядке роста S с отсечениями
 *   «no-good» можно остановить, как только LB(S(x̂)) ≥ лучшего точного E.
 */
export class CertifiedIlpSolver implements FactorSelectionSolver {
  readonly id = 'ilp' as const;
  readonly maxFactors = MAX_FACTORS;

  constructor(
    private readonly milp: MilpPort,
    private readonly options: CertifiedIlpOptions = {},
  ) {}

  async solve(problem: FactorSelectionProblem, options?: SolveOptions): Promise<SelectionResult> {
    validateProblem(problem);
    const n = problem.factors.length;
    const limit = resolveRankingLimit(options);
    const maxIterations = Math.min(this.options.maxIterations ?? DEFAULT_MAX_ITERATIONS, 2 ** n);
    const evaluator = new SubsetEvaluator(problem);
    const codeOf = (i: number) => problem.factors[i]!.code;
    const top = new TopK<SubsetMetrics>(limit, (a, b) => compareSubsets(a, b, codeOf));

    const base = this.baseModel(problem);
    const cuts: MilpConstraint[] = [];
    let best: SubsetMetrics | null = null;
    let iterations = 0;
    let lowerBound: number | null = null;
    let proven = false;

    while (iterations < maxIterations) {
      const solution = await this.milp.solve({ ...base, constraints: [...base.constraints, ...cuts] });
      if (solution.status === 'infeasible') {
        proven = true; // допустимое множество исчерпано
        lowerBound = null;
        break;
      }
      iterations++;
      const indices = solution.values.flatMap((v, i) => (v > 0.5 ? [i] : []));
      const m = evaluator.evaluate(indices);
      lowerBound = problem.costs.cFR * -expm1(-Math.max(0, m.frrSum - S_SAFETY));
      if (best !== null && lowerBound >= best.objective) {
        proven = true;
        break;
      }
      // Точная проверка допустимости — арбитр (допуски MILP могут пропустить граничный набор).
      if (evaluator.isFeasible(m)) {
        top.offer(m);
        if (best === null || compareSubsets(m, best, codeOf) < 0) best = m;
      }
      cuts.push(this.noGoodCut(indices, n, cuts.length));
    }

    const ranking = top.toArray().map((m) => evaluator.toSolution(m));
    return {
      status: best === null ? 'infeasible' : 'optimal',
      optimum: best === null ? null : evaluator.toSolution(best),
      ranking,
      rankingComplete: false,
      stats: { factorsCount: n, subsetsTotal: 2 ** n - 1, feasibleCount: null, rejectedBy: null },
      solver: {
        used: 'ilp',
        certificate: { iterations, lowerBound, bestObjective: best?.objective ?? null, proven },
      },
    };
  }

  private baseModel(problem: FactorSelectionProblem): MilpModel {
    const { factors, constraints: c } = problem;
    const n = factors.length;
    const constraints: MilpConstraint[] = [{ name: 'nonempty', coeffs: factors.map(() => 1), sense: '>=', rhs: 1 }];
    if (c.latencyMaxMs !== null) {
      constraints.push({ name: 'latency', coeffs: factors.map((f) => f.latencyMs), sense: '<=', rhs: slackRhs(c.latencyMaxMs) });
    }
    if (c.budget !== null) {
      constraints.push({ name: 'budget', coeffs: factors.map((f) => f.cost), sense: '<=', rhs: slackRhs(c.budget) });
    }
    if (c.minPadFactors > 0) {
      constraints.push({ name: 'pad', coeffs: factors.map((f) => (f.hasPad ? 1 : 0)), sense: '>=', rhs: c.minPadFactors });
    }
    if (c.farMax !== null) {
      // Точная линейная форма ограничения FAR(x) ≤ FAR_max в логарифмах.
      constraints.push({ name: 'far', coeffs: factors.map((f) => Math.log(f.far)), sense: '<=', rhs: Math.log(c.farMax) + EPS });
    }
    return { numVars: n, objective: factors.map((f) => f.frr), constraints };
  }

  /** Σ_{i∈x̂} (1 − x_i) + Σ_{i∉x̂} x_i ≥ 1  ⇔  Σ_{i∉x̂} x_i − Σ_{i∈x̂} x_i ≥ 1 − |x̂|. */
  private noGoodCut(indices: readonly number[], n: number, k: number): MilpConstraint {
    const selected = new Set(indices);
    const coeffs = Array.from({ length: n }, (_, i) => (selected.has(i) ? -1 : 1));
    return { name: `cut${k}`, coeffs, sense: '>=', rhs: 1 - indices.length };
  }
}
