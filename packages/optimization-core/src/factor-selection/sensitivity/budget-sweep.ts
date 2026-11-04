import { assertDomain, isFiniteNumber, ProblemTooLargeError } from '../../errors';
import { leq } from '../../numeric';
import { EXHAUSTIVE_MAX_FACTORS } from '../solvers/exhaustive.solver';
import { compareSubsets, indicesFromMask, SubsetEvaluator } from '../subset-evaluator';
import type { FactorSelectionProblem, SubsetMetrics } from '../types';
import { validateProblem } from '../validation';

export const MAX_SWEEP_POINTS = 500;

export interface BudgetSweepRange {
  readonly from: number;
  readonly to: number;
  readonly step: number;
}

export interface BudgetSweepPoint {
  readonly budget: number;
  readonly codes: readonly string[] | null;
  readonly objective: number | null;
}

export interface BudgetBreakpoint extends BudgetSweepPoint {
  /** E_new / E_old относительно предыдущего оптимума — «цена» изменения бюджета. */
  readonly ratioToPrevious: number | null;
}

export interface BudgetSweepResult {
  readonly points: readonly BudgetSweepPoint[];
  readonly breakpoints: readonly BudgetBreakpoint[];
}

/**
 * Анализ чувствительности к бюджету (док. 02, §2.2.4): наборы, допустимые без учёта бюджета, сортируются
 * по стоимости; при движении B вверх поддерживается лучший набор среди C(x) ≤ B. O(2ⁿ·n + F·log F + точки).
 */
export function budgetSweep(problem: FactorSelectionProblem, range: BudgetSweepRange): BudgetSweepResult {
  const relaxed: FactorSelectionProblem = {
    ...problem,
    constraints: { ...problem.constraints, budget: null },
  };
  validateProblem(relaxed);
  const n = problem.factors.length;
  if (n > EXHAUSTIVE_MAX_FACTORS) {
    throw new ProblemTooLargeError(`анализ бюджета поддерживает не более ${EXHAUSTIVE_MAX_FACTORS} факторов`);
  }
  assertDomain(
    isFiniteNumber(range.from) && range.from >= 0,
    'начало диапазона должно быть ≥ 0',
    'sweep.from',
  );
  assertDomain(
    isFiniteNumber(range.to) && range.to >= range.from,
    'конец диапазона должен быть ≥ начала',
    'sweep.to',
  );
  assertDomain(isFiniteNumber(range.step) && range.step > 0, 'шаг должен быть > 0', 'sweep.step');
  const count = Math.floor((range.to - range.from) / range.step + 1e-9) + 1;
  assertDomain(count <= MAX_SWEEP_POINTS, `не более ${MAX_SWEEP_POINTS} точек`, 'sweep.step');

  const evaluator = new SubsetEvaluator(relaxed);
  const codeOf = (i: number) => problem.factors[i]!.code;
  const candidates: SubsetMetrics[] = [];
  for (let mask = 1; mask < 2 ** n; mask++) {
    const m = evaluator.evaluate(indicesFromMask(mask, n));
    if (evaluator.isFeasible(m)) candidates.push(m);
  }
  candidates.sort((a, b) => a.cost - b.cost);

  const points: BudgetSweepPoint[] = [];
  let pointer = 0;
  let best: SubsetMetrics | null = null;
  for (let k = 0; k < count; k++) {
    const budget = Number((range.from + k * range.step).toFixed(12));
    while (pointer < candidates.length && leq(candidates[pointer]!.cost, budget)) {
      const c = candidates[pointer++]!;
      if (best === null || compareSubsets(c, best, codeOf) < 0) best = c;
    }
    points.push({
      budget,
      codes: best === null ? null : best.indices.map(codeOf),
      objective: best === null ? null : best.objective,
    });
  }

  const breakpoints: BudgetBreakpoint[] = [];
  let prev: BudgetSweepPoint | null = null;
  for (const p of points) {
    const key = p.codes?.join('+') ?? null;
    const prevKey = prev ? (prev.codes?.join('+') ?? null) : undefined;
    if (prev === null || key !== prevKey) {
      const prevObjective = prev?.objective ?? null;
      const ratio = prevObjective !== null && p.objective !== null ? p.objective / prevObjective : null;
      breakpoints.push({ ...p, ratioToPrevious: ratio });
    }
    prev = p;
  }
  return { points, breakpoints };
}
