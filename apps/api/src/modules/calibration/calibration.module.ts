import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { APP_CONFIG, type AppConfig } from '../../shared/config/env';
import { FactorCatalogsModule } from '../factor-catalogs/factor-catalogs.module';
import { ScoreDatasetsModule } from '../score-datasets/score-datasets.module';
import { ThresholdModule } from '../threshold/threshold.module';
import { AttemptsService } from './application/attempts.service';
import { BatchJobsService } from './application/batch-jobs.service';
import { CalibrationService } from './application/calibration.service';
import { DriftService } from './application/drift.service';
import { PadTestService } from './application/pad-test.service';
import { CALIBRATION_QUERY, DRIFT_ALERTS } from './application/ports';
import { ProtocolReportService } from './application/protocol-report.service';
import {
  KyselyCalibrationQuery,
  KyselyDriftAlertRepository,
} from './infrastructure/kysely-calibration.query';
import {
  AttemptsController,
  BatchController,
  CalibrationController,
  DriftController,
  PadTestController,
} from './presentation/calibration.controller';

/** Замкнутый контур (v2.2): калибровка ядром v1, измеренный каталог, испытание PAD, дрейф, журнал попыток. */
@Module({
  imports: [
    ThresholdModule,
    ScoreDatasetsModule,
    FactorCatalogsModule,
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.BATCH_MAX_BYTES, files: 1 },
      }),
    }),
  ],
  controllers: [
    BatchController,
    CalibrationController,
    DriftController,
    PadTestController,
    AttemptsController,
  ],
  providers: [
    { provide: CALIBRATION_QUERY, useClass: KyselyCalibrationQuery },
    { provide: DRIFT_ALERTS, useClass: KyselyDriftAlertRepository },
    CalibrationService,
    PadTestService,
    DriftService,
    AttemptsService,
    BatchJobsService,
    ProtocolReportService,
  ],
})
export class CalibrationModule {}
