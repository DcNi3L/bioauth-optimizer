import { CertifiedIlpSolver } from './solvers/certified-ilp.solver';
import { ExhaustiveSolver } from './solvers/exhaustive.solver';
import { HighsMilpAdapter } from './solvers/highs-milp.adapter';
import { SolverSelector } from './solvers/solver-selector';
import type { FactorSelectionProblem, SelectionResult, SolveOptions, SolverMode } from './types';

export * from './fusion/and-fusion.rule';
export type * from './fusion/fusion-rule';
export * from './sensitivity/budget-sweep';
export * from './solvers/certified-ilp.solver';
export * from './solvers/exhaustive.solver';
export * from './solvers/factor-selection-solver';
export * from './solvers/highs-milp.adapter';
export type * from './solvers/milp-port';
export * from './solvers/solver-selector';
export * from './subset-evaluator';
export type * from './types';
export * from './validation';

/** Селектор по умолчанию: полный перебор + сертифицированное ЦЛП на HiGHS. */
export function createDefaultSolverSelector(): SolverSelector {
  return new SolverSelector([new ExhaustiveSolver(), new CertifiedIlpSolver(new HighsMilpAdapter())]);
}

/** Фасад модуля «Состав факторов». */
export function solveFactorSelection(
  problem: FactorSelectionProblem,
  options: SolveOptions & { readonly solver?: SolverMode } = {},
  selector: SolverSelector = createDefaultSolverSelector(),
): Promise<SelectionResult> {
  return selector.select(problem.factors.length, options.solver ?? 'auto').solve(problem, options);
}
