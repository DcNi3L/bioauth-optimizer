import { createDefaultSolverSelector } from '@bioauth/optimization-core';
import { Module } from '@nestjs/common';

import { ExperimentsModule } from '../experiments/experiments.module';
import { FactorCatalogsModule } from '../factor-catalogs/factor-catalogs.module';
import { BudgetSweepUseCase } from './application/budget-sweep.use-case';
import { SolveFactorSelectionUseCase } from './application/solve-factor-selection.use-case';
import { SOLVER_SELECTOR } from './application/tokens';
import { FactorSelectionController } from './presentation/factor-selection.controller';

@Module({
  imports: [ExperimentsModule, FactorCatalogsModule],
  controllers: [FactorSelectionController],
  providers: [
    // Реестр решателей (OCP): новый решатель регистрируется здесь, use case не меняется.
    { provide: SOLVER_SELECTOR, useFactory: createDefaultSolverSelector },
    SolveFactorSelectionUseCase,
    BudgetSweepUseCase,
  ],
})
export class FactorSelectionModule {}
