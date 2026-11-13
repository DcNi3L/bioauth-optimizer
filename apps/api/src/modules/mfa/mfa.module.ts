import { Module } from '@nestjs/common';

import { AesGcmSecretBox, SECRET_BOX } from '../../shared/crypto/secret-box';
import { MfaService } from './application/mfa.service';
import { MFA_REPOSITORY } from './application/ports';
import { KyselyMfaRepository } from './infrastructure/kysely-mfa.repository';
import { MfaController } from './presentation/mfa.controller';

@Module({
  controllers: [MfaController],
  providers: [
    { provide: MFA_REPOSITORY, useClass: KyselyMfaRepository },
    { provide: SECRET_BOX, useClass: AesGcmSecretBox },
    MfaService,
  ],
  exports: [MfaService],
})
export class MfaModule {}
