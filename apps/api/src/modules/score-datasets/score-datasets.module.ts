import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';

import { APP_CONFIG, type AppConfig } from '../../shared/config/env';
import { SCORE_DATASET_REPOSITORY, SCORE_FILE_PARSER, SCORE_SAMPLES_READER } from './application/ports';
import { GetScoreDatasetUseCase, UploadScoreDatasetUseCase } from './application/score-dataset.use-cases';
import { CsvScoreFileParser } from './infrastructure/csv-score-file.parser';
import { KyselyScoreDatasetRepository } from './infrastructure/kysely-score-dataset.repository';
import { ScoreDatasetsController } from './presentation/score-datasets.controller';

@Module({
  imports: [
    MulterModule.registerAsync({
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => ({
        storage: memoryStorage(),
        limits: { fileSize: config.MAX_UPLOAD_MB * 1024 * 1024, files: 1 },
      }),
    }),
  ],
  controllers: [ScoreDatasetsController],
  providers: [
    KyselyScoreDatasetRepository,
    { provide: SCORE_DATASET_REPOSITORY, useExisting: KyselyScoreDatasetRepository },
    { provide: SCORE_SAMPLES_READER, useExisting: KyselyScoreDatasetRepository },
    { provide: SCORE_FILE_PARSER, useClass: CsvScoreFileParser },
    UploadScoreDatasetUseCase,
    GetScoreDatasetUseCase,
  ],
  exports: [SCORE_SAMPLES_READER, SCORE_DATASET_REPOSITORY],
})
export class ScoreDatasetsModule {}
