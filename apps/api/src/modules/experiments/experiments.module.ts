import { Module } from '@nestjs/common';
import { ExperimentRecorder } from './application/experiment-recorder';
import { GetExperimentUseCase, ListExperimentsUseCase } from './application/experiment-queries';
import { EXPERIMENT_REPOSITORY } from './application/experiment.repository';
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
