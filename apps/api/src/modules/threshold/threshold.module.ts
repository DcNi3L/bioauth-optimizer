import { Module } from '@nestjs/common';

import { ExperimentsModule } from '../experiments/experiments.module';
import { ScoreDatasetsModule } from '../score-datasets/score-datasets.module';
import { OptimizeThresholdUseCase } from './application/optimize-threshold.use-case';
import { ThresholdController } from './presentation/threshold.controller';

@Module({
  imports: [ExperimentsModule, ScoreDatasetsModule],
  controllers: [ThresholdController],
  providers: [OptimizeThresholdUseCase],
})
export class ThresholdModule {}
