import { Module } from '@nestjs/common';

import { FactorCatalogsModule } from '../factor-catalogs/factor-catalogs.module';
import { ScoreDatasetsModule } from '../score-datasets/score-datasets.module';
import { ThresholdModule } from '../threshold/threshold.module';
import { AttemptsService } from './application/attempts.service';
import { CalibrationService } from './application/calibration.service';
import { DriftService } from './application/drift.service';
import { PadTestService } from './application/pad-test.service';
import { CALIBRATION_QUERY, DRIFT_ALERTS } from './application/ports';
import {
  KyselyCalibrationQuery,
  KyselyDriftAlertRepository,
} from './infrastructure/kysely-calibration.query';
import {
  AttemptsController,
  CalibrationController,
  DriftController,
  PadTestController,
} from './presentation/calibration.controller';

/** Замкнутый контур (v2.2): калибровка ядром v1, измеренный каталог, испытание PAD, дрейф, журнал попыток. */
@Module({
  imports: [ThresholdModule, ScoreDatasetsModule, FactorCatalogsModule],
  controllers: [CalibrationController, DriftController, PadTestController, AttemptsController],
  providers: [
    { provide: CALIBRATION_QUERY, useClass: KyselyCalibrationQuery },
    { provide: DRIFT_ALERTS, useClass: KyselyDriftAlertRepository },
    CalibrationService,
    PadTestService,
    DriftService,
    AttemptsService,
  ],
})
export class CalibrationModule {}
