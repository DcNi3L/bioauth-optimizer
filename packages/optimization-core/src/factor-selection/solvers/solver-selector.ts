import { ProblemTooLargeError } from '../../errors';
import type { SolverId, SolverMode } from '../types';
import type { FactorSelectionSolver } from './factor-selection-solver';

/** Выбор решателя по режиму (OCP: реестр решателей передаётся извне). */
export class SolverSelector {
  private readonly registry: ReadonlyMap<SolverId, FactorSelectionSolver>;

  constructor(solvers: readonly FactorSelectionSolver[]) {
    this.registry = new Map(solvers.map((s) => [s.id, s]));
  }

  select(factorsCount: number, mode: SolverMode): FactorSelectionSolver {
    if (mode === 'auto') {
      const exhaustive = this.registry.get('exhaustive');
      if (exhaustive && factorsCount <= exhaustive.maxFactors) return exhaustive;
      return this.require('ilp', factorsCount);
    }
    return this.require(mode, factorsCount);
  }

  private require(id: SolverId, factorsCount: number): FactorSelectionSolver {
    const solver = this.registry.get(id);
    if (!solver) throw new Error(`решатель «${id}» не зарегистрирован`);
    if (factorsCount > solver.maxFactors) {
      throw new ProblemTooLargeError(
        `решатель «${id}» поддерживает не более ${solver.maxFactors} факторов (передано ${factorsCount})`,
      );
    }
    return solver;
  }
}
