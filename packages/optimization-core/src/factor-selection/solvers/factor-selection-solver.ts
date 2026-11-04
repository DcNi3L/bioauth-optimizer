import type { FactorSelectionProblem, SelectionResult, SolveOptions, SolverId } from '../types';

/** Общий контракт решателей (LSP: любой решатель взаимозаменяем). */
export interface FactorSelectionSolver {
  readonly id: SolverId;
  /** Максимальное число факторов, которое решатель обрабатывает. */
  readonly maxFactors: number;
  solve(problem: FactorSelectionProblem, options?: SolveOptions): Promise<SelectionResult>;
}

export const DEFAULT_RANKING_LIMIT = 100;
export const MAX_RANKING_LIMIT = 1000;

export function resolveRankingLimit(options?: SolveOptions): number {
  const limit = options?.rankingLimit ?? DEFAULT_RANKING_LIMIT;
  return Math.max(1, Math.min(MAX_RANKING_LIMIT, Math.floor(limit)));
}
