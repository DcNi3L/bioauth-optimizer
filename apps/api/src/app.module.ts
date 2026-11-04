import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from './shared/config/config.module';
import { DatabaseModule } from './shared/database/database.module';
import { HealthController } from './shared/health/health.controller';
import { ProblemDetailsFilter } from './shared/http/problem-details.filter';
import { LoggingModule } from './shared/logging/logging.module';
import { ExamplesModule } from './modules/examples/examples.module';
import { ExperimentsModule } from './modules/experiments/experiments.module';
import { FactorCatalogsModule } from './modules/factor-catalogs/factor-catalogs.module';
import { FactorSelectionModule } from './modules/factor-selection/factor-selection.module';
import { ScoreDatasetsModule } from './modules/score-datasets/score-datasets.module';
import { ThresholdModule } from './modules/threshold/threshold.module';

@Module({
  imports: [
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    ThresholdModule,
    FactorSelectionModule,
    FactorCatalogsModule,
    ScoreDatasetsModule,
    ExperimentsModule,
    ExamplesModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: ProblemDetailsFilter }],
})
export class AppModule {}
