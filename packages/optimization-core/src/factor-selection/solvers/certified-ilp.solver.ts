import { EPS, expm1, log1p } from '../../numeric';
import { SubsetEvaluator, compareSubsets } from '../subset-evaluator';
import { TopK } from '../top-k';
import type { FactorSelectionProblem, SelectionResult, SolveOptions, SubsetMetrics } from '../types';
import { MAX_FACTORS, validateProblem } from '../validation';
import { type FactorSelectionSolver, resolveRankingLimit } from './factor-selection-solver';
import type { MilpConstraint, MilpModel, MilpPort, MilpSolution } from './milp-port';

/** Запас на численный допуск MILP при вычислении нижней оценки (консервативно уменьшает Λ). */
const LAMBDA_SAFETY = 1e-9;
/** Допуск «ничьей» по Λ в лексикографическом шаге и запас границы Парето по L (в сторону включения наборов). */
const TIE_TOLERANCE = 1e-9;
const DEFAULT_MAX_ITERATIONS = 10_000;

export interface CertifiedIlpOptions {
  readonly maxIterations?: number;
}

const slackRhs = (rhs: number) => rhs + EPS * Math.max(1, Math.abs(rhs));

/**
 * Решатель B (док. 02, §2.2.3) — метод СРО1: логарифмирование сводит задачу (2)–(3) к ЦЛП.
 *
 * Обе ошибки набора — монотонные функции двух ЛИНЕЙНЫХ форм от x:
 *   L(x) = Σ ln(FAR_i)·x_i,             FAR(x) = e^{L(x)}
 *   Λ(x) = −Σ ln(1 − FRR_i)·x_i ≥ 0,    FRR(x) = 1 − e^{−Λ(x)}   (точнее приближения Σ FRR_i·x_i из статьи)
 * поэтому E(x) = cFA·e^{L} + cFR·(1 − e^{−Λ}) возрастает по обеим и оптимум лежит на фронте Парето (Λ, L).
 *
 * Фронт обходится методом ε-ограничений:
 *   1) x̂ = argmin Λ  при  L(x) ≤ L_bound  (+ ограничения (3) и отсечения уже просмотренных наборов);
 *   2) среди наборов с Λ ≤ Λ(x̂) берётся argmin L — эффективная точка x̂′ (разрешение «ничьих» по Λ);
 *   3) L_bound ← L(x̂′): все наборы с бóльшим L доминируются x̂′ и исключаются.
 * Каждый следующий шаг даёт Λ не меньше предыдущего, поэтому LB = cFR·(1 − e^{−Λ(x̂)}) — нижняя граница E
 * для всех ещё не просмотренных наборов. Остановка: LB ≥ лучшего E (оптимум доказан) или наборов не осталось.
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
    const lambda = problem.factors.map((f) => -log1p(-f.frr));
    const logFar = problem.factors.map((f) => Math.log(f.far));
    const lambdaOf = (indices: readonly number[]) => indices.reduce((s, i) => s + lambda[i]!, 0);
    const toIndices = (s: Extract<MilpSolution, { status: 'optimal' }>) => s.values.flatMap((v, i) => (v > 0.5 ? [i] : []));

    const cuts: MilpConstraint[] = [];
    const seen = new Set<string>();
    let paretoBound: number | null = null;
    let best: SubsetMetrics | null = null;
    let iterations = 0;
    let certifiedBound: number | null = null;
    let proven = false;

    while (iterations < maxIterations) {
      const constraints = [...base.constraints, ...cuts];
      if (paretoBound !== null) {
        constraints.push({ name: 'pareto', coeffs: logFar, sense: '<=', rhs: paretoBound + TIE_TOLERANCE });
      }
      // Шаг 1: минимальное Λ среди оставшихся наборов.
      const byLambda = await this.milp.solve({ ...base, objective: lambda, constraints });
      if (byLambda.status === 'infeasible') {
        proven = true; // недоминируемых наборов больше нет
        break;
      }
      iterations++;
      const first = evaluator.evaluate(toIndices(byLambda));
      const lambdaK = lambdaOf(first.indices);
      const lowerBound = problem.costs.cFR * -expm1(-Math.max(0, lambdaK - LAMBDA_SAFETY));
      if (best !== null && lowerBound >= best.objective) {
        certifiedBound = lowerBound;
        proven = true;
        break;
      }
      // Шаг 2: среди «ничьих» по Λ — набор с минимальным FAR (эффективная точка фронта).
      const byFar = await this.milp.solve({
        ...base,
        objective: logFar,
        constraints: [...constraints, { name: 'lex', coeffs: lambda, sense: '<=', rhs: lambdaK + TIE_TOLERANCE * Math.max(1, lambdaK) }],
      });
      const efficient = byFar.status === 'optimal' ? evaluator.evaluate(toIndices(byFar)) : first;

      for (const m of [first, efficient]) {
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
      // Шаг 3: сдвиг границы Парето — только по точно допустимому набору (иначе можно отсечь допустимые).
      if (evaluator.isFeasible(efficient)) paretoBound = efficient.logFar;
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
        certificate: { iterations, lowerBound: certifiedBound, bestObjective: best?.objective ?? null, proven },
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
    return { numVars: n, objective: factors.map(() => 0), constraints };
  }

  /** Σ_{i∈x̂} (1 − x_i) + Σ_{i∉x̂} x_i ≥ 1  ⇔  Σ_{i∉x̂} x_i − Σ_{i∈x̂} x_i ≥ 1 − |x̂|. */
  private noGoodCut(indices: readonly number[], n: number, k: number): MilpConstraint {
    const selected = new Set(indices);
    const coeffs = Array.from({ length: n }, (_, i) => (selected.has(i) ? -1 : 1));
    return { name: `cut${k}`, coeffs, sense: '>=', rhs: 1 - indices.length };
  }
}
