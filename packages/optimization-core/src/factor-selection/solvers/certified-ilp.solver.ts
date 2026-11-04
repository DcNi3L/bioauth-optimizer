import { EPS, expm1 } from '../../numeric';
import { SubsetEvaluator, compareSubsets } from '../subset-evaluator';
import { TopK } from '../top-k';
import type { FactorSelectionProblem, SelectionResult, SolveOptions, SubsetMetrics } from '../types';
import { MAX_FACTORS, validateProblem } from '../validation';
import { type FactorSelectionSolver, resolveRankingLimit } from './factor-selection-solver';
import type { MilpConstraint, MilpModel, MilpPort } from './milp-port';

/** Консервативные запасы на численный допуск MILP при вычислении нижней оценки. */
const S_SAFETY = 1e-9;
const L_SAFETY = 1e-9;
const DEFAULT_MAX_ITERATIONS = 10_000;

export interface CertifiedIlpOptions {
  readonly maxIterations?: number;
}

const slackRhs = (rhs: number) => rhs + EPS * Math.max(1, Math.abs(rhs));

/**
 * Решатель B (док. 02, §2.2.3) — метод СРО1: линеаризованное ЦЛП
 *   min S(x) = Σ FRR_i·x_i  при  Σ x_i·ln FAR_i ≤ ln FAR_max  и линейных ограничениях (3),
 * дополненное сертификатом оптимальности для исходной нелинейной E(x) = cFA·FAR(x) + cFR·FRR(x).
 *
 * На каждой итерации по ещё не отсечённым наборам решаются две задачи MILP:
 *   S_min = min Σ FRR_i·x_i   и   L_min = min Σ ln(FAR_i)·x_i.
 * Каждое слагаемое E не меньше своего минимума, поэтому для любого оставшегося x
 *   E(x) ≥ LB = cFR·(1 − e^{−S_min}) + cFA·e^{L_min}.
 * Оба найденных набора оцениваются точно и отсекаются («no-good»); остановка — когда LB ≥ лучшего E.
 * Вторая задача нужна, когда FRR малы: без неё оценка вырождается в 0 и решатель перебирает все наборы.
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
    const logFar = problem.factors.map((f) => Math.log(f.far));
    const cuts: MilpConstraint[] = [];
    const seen = new Set<string>();
    let best: SubsetMetrics | null = null;
    let iterations = 0;
    let lowerBound: number | null = null;
    let proven = false;
    const toIndices = (values: readonly number[]) => values.flatMap((v, i) => (v > 0.5 ? [i] : []));

    while (iterations < maxIterations) {
      const constraints = [...base.constraints, ...cuts];
      const bySum = await this.milp.solve({ ...base, constraints });
      if (bySum.status === 'infeasible') {
        proven = true; // допустимое множество исчерпано
        lowerBound = null;
        break;
      }
      const byFar = await this.milp.solve({ ...base, objective: logFar, constraints });
      iterations++;
      const candidates = [evaluator.evaluate(toIndices(bySum.values))];
      if (byFar.status === 'optimal') candidates.push(evaluator.evaluate(toIndices(byFar.values)));

      // Нижняя оценка по всем ещё не отсечённым наборам (минимумы пересчитаны точно по найденным решениям).
      const sMin = candidates[0]!.frrSum;
      const lMin = Math.min(...candidates.map((m) => m.logFar));
      lowerBound =
        problem.costs.cFR * -expm1(-Math.max(0, sMin - S_SAFETY)) + problem.costs.cFA * Math.exp(lMin - L_SAFETY);
      if (best !== null && lowerBound >= best.objective) {
        proven = true;
        break;
      }
      for (const m of candidates) {
        const key = m.indices.join(',');
        if (seen.has(key)) continue;
        seen.add(key);
        // Точная проверка допустимости — арбитр (допуски MILP могут пропустить граничный набор).
        if (evaluator.isFeasible(m)) {
          top.offer(m);
          if (best === null || compareSubsets(m, best, codeOf) < 0) best = m;
        }
        cuts.push(this.noGoodCut(m.indices, n, cuts.length));
      }
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
