import { Global, Module } from '@nestjs/common';

import { PasskeyService } from './application/passkey.use-cases';
import { CHALLENGES, CREDENTIALS, WEBAUTHN } from './application/ports';
import { KyselyCredentialRepository } from './infrastructure/kysely-credentials.repository';
import { SimpleWebAuthnAdapter } from './infrastructure/simple-webauthn.adapter';
import { WebAuthnController } from './presentation/webauthn.controller';

@Global()
@Module({
  controllers: [WebAuthnController],
  providers: [
    KyselyCredentialRepository,
    { provide: CREDENTIALS, useExisting: KyselyCredentialRepository },
    { provide: CHALLENGES, useExisting: KyselyCredentialRepository },
    { provide: WEBAUTHN, useClass: SimpleWebAuthnAdapter },
    PasskeyService,
  ],
  exports: [WEBAUTHN, CREDENTIALS],
})
export class WebAuthnModule {}
