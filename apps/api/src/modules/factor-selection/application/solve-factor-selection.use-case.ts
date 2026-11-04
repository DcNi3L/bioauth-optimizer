import type { FactorSelectionCommand, FactorSelectionResponse } from '@bioauth/contracts';
import { CORE_VERSION, type FactorSelectionProblem, type SolverSelector } from '@bioauth/optimization-core';
import { Inject, Injectable } from '@nestjs/common';

import { InfeasibleProblemError } from '../../../shared/errors';
import { ExperimentRecorder } from '../../experiments/application/experiment-recorder';
import { FACTOR_CATALOG_READER, type FactorCatalogReader } from '../../factor-catalogs/application/ports';
import { resolveFactors } from './resolve-factors';
import { SOLVER_SELECTOR } from './tokens';

/** Сценарий «Состав факторов» (формулы 2–3 СРО1). */
@Injectable()
export class SolveFactorSelectionUseCase {
  constructor(
    @Inject(SOLVER_SELECTOR) private readonly selector: SolverSelector,
    @Inject(FACTOR_CATALOG_READER) private readonly catalogs: FactorCatalogReader,
    private readonly recorder: ExperimentRecorder,
  ) {}

  async execute(cmd: FactorSelectionCommand): Promise<FactorSelectionResponse> {
    const started = performance.now();
    const factors = await resolveFactors(this.catalogs, cmd);
    const problem: FactorSelectionProblem = {
      factors,
      costs: cmd.costs,
      constraints: cmd.constraints,
      fusionRule: cmd.fusionRule,
    };
    const solver = this.selector.select(factors.length, cmd.solver);
    const result = await solver.solve(problem, { rankingLimit: cmd.rankingLimit });
    const durationMs = performance.now() - started;
    const experimentId = await this.recorder.record({
      type: 'FACTOR_SELECTION',
      status: result.status === 'optimal' ? 'OK' : 'INFEASIBLE',
      input: { ...cmd, factors }, // копия факторов: история не зависит от последующих правок каталога
      result,
      solver: result.solver.used,
      durationMs,
      factorCatalogId: cmd.catalogId ?? null,
    });
    if (result.status === 'infeasible') {
      throw new InfeasibleProblemError('ни один набор факторов не удовлетворяет ограничениям', {
        experimentId,
        rejectedBy: result.stats.rejectedBy ?? undefined,
      });
    }
    return {
      experimentId,
      ...result,
      meta: { coreVersion: CORE_VERSION, durationMs: Math.round(durationMs) },
    } as FactorSelectionResponse;
  }
}
