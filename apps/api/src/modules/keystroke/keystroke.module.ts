import { Module } from '@nestjs/common';

import { AesGcmSecretBox, SECRET_BOX } from '../../shared/crypto/secret-box';
import { KeystrokeService } from './application/keystroke.service';
import { KEYSTROKE_REPOSITORY } from './application/ports';
import { KyselyKeystrokeRepository } from './infrastructure/kysely-keystroke.repository';
import { KeystrokeController } from './presentation/keystroke.controller';

@Module({
  controllers: [KeystrokeController],
  providers: [
    { provide: KEYSTROKE_REPOSITORY, useClass: KyselyKeystrokeRepository },
    { provide: SECRET_BOX, useClass: AesGcmSecretBox },
    KeystrokeService,
  ],
  exports: [KeystrokeService],
})
export class KeystrokeModule {}
