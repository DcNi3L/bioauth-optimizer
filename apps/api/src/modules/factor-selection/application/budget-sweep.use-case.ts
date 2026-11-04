import { Inject, Injectable } from '@nestjs/common';
import { CORE_VERSION, budgetSweep } from '@bioauth/optimization-core';
import type { BudgetSweepCommand, BudgetSweepResponse } from '@bioauth/contracts';
import { ExperimentRecorder } from '../../experiments/application/experiment-recorder';
import { FACTOR_CATALOG_READER, type FactorCatalogReader } from '../../factor-catalogs/application/ports';
import { resolveFactors } from './resolve-factors';

/** Анализ чувствительности оптимума к бюджету (док. 02, §2.2.4). */
@Injectable()
export class BudgetSweepUseCase {
  constructor(
    @Inject(FACTOR_CATALOG_READER) private readonly catalogs: FactorCatalogReader,
    private readonly recorder: ExperimentRecorder,
  ) {}

  async execute(cmd: BudgetSweepCommand): Promise<BudgetSweepResponse> {
    const started = performance.now();
    const factors = await resolveFactors(this.catalogs, cmd);
    const result = budgetSweep(
      { factors, costs: cmd.costs, constraints: { ...cmd.constraints, budget: null }, fusionRule: cmd.fusionRule },
      cmd.sweep,
    );
    const durationMs = performance.now() - started;
    const anyFeasible = result.points.some((p) => p.codes !== null);
    const experimentId = await this.recorder.record({
      type: 'BUDGET_SWEEP',
      status: anyFeasible ? 'OK' : 'INFEASIBLE',
      input: { ...cmd, factors },
      result,
      solver: 'exhaustive',
      durationMs,
      factorCatalogId: cmd.catalogId ?? null,
    });
    return { experimentId, ...result, meta: { coreVersion: CORE_VERSION, durationMs: Math.round(durationMs) } } as BudgetSweepResponse;
  }
}
