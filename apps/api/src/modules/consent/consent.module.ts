import { Global, Module } from '@nestjs/common';

import { CONSENT_CHECKER, CONSENT_REPOSITORY, ConsentService } from './application/consent.use-cases';
import { KyselyConsentRepository } from './infrastructure/kysely-consent.repository';
import { ConsentController } from './presentation/consent.controller';

@Global()
@Module({
  controllers: [ConsentController],
  providers: [
    { provide: CONSENT_REPOSITORY, useClass: KyselyConsentRepository },
    ConsentService,
    { provide: CONSENT_CHECKER, useExisting: ConsentService },
  ],
  exports: [CONSENT_CHECKER],
})
export class ConsentModule {}
