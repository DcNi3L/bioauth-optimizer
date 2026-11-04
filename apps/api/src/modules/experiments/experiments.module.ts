import { Module } from '@nestjs/common';

import { EXPERIMENT_REPOSITORY } from './application/experiment.repository';
import { GetExperimentUseCase, ListExperimentsUseCase } from './application/experiment-queries';
import { ExperimentRecorder } from './application/experiment-recorder';
import { KyselyExperimentRepository } from './infrastructure/kysely-experiment.repository';
import { ExperimentsController } from './presentation/experiments.controller';

@Module({
  controllers: [ExperimentsController],
  providers: [
    { provide: EXPERIMENT_REPOSITORY, useClass: KyselyExperimentRepository },
    ExperimentRecorder,
    ListExperimentsUseCase,
    GetExperimentUseCase,
  ],
  exports: [ExperimentRecorder],
})
export class ExperimentsModule {}
