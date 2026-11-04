import { Global, Module } from '@nestjs/common';

import {
  AUTH_ATTEMPTS,
  BIOMETRIC_ERASER,
  FACE_ENGINE,
  FACE_TEMPLATES,
  SCORE_SAMPLES,
  TEMPLATE_CIPHER,
} from './application/ports';
import { AesGcmTemplateCipher } from './infrastructure/aes-gcm-template-cipher';
import { BackgroundTasks } from './infrastructure/background-tasks';
import { HttpBioEngineAdapter } from './infrastructure/http-bio-engine.adapter';
import {
  KyselyAttemptRepository,
  KyselyBiometricEraser,
  KyselyFaceTemplateRepository,
  KyselyScoreSampleRepository,
} from './infrastructure/kysely-biometrics.repository';

/** Общая инфраструктура биометрии: порт bio-engine, шифрование шаблонов, хранилища попыток и оценок. */
@Global()
@Module({
  providers: [
    { provide: FACE_ENGINE, useClass: HttpBioEngineAdapter },
    { provide: TEMPLATE_CIPHER, useClass: AesGcmTemplateCipher },
    { provide: FACE_TEMPLATES, useClass: KyselyFaceTemplateRepository },
    { provide: SCORE_SAMPLES, useClass: KyselyScoreSampleRepository },
    { provide: AUTH_ATTEMPTS, useClass: KyselyAttemptRepository },
    { provide: BIOMETRIC_ERASER, useClass: KyselyBiometricEraser },
    BackgroundTasks,
  ],
  exports: [
    FACE_ENGINE,
    TEMPLATE_CIPHER,
    FACE_TEMPLATES,
    SCORE_SAMPLES,
    AUTH_ATTEMPTS,
    BIOMETRIC_ERASER,
    BackgroundTasks,
  ],
})
export class BiometricsModule {}
