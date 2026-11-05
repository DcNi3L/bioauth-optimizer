import { Module } from '@nestjs/common';

import { ClientsService } from './application/clients.service';
import { KeysService } from './application/keys.service';
import { OidcService } from './application/oidc.service';
import { OIDC_REPOSITORY } from './application/ports';
import { KyselyOidcRepository } from './infrastructure/kysely-oidc.repository';
import { OauthApiController, OauthClientsController } from './presentation/oauth-api.controller';
import { OidcController } from './presentation/oidc.controller';

/** Сервер авторизации OpenID Connect (v3): другие сервисы входят через BioAuth. */
@Module({
  controllers: [OidcController, OauthApiController, OauthClientsController],
  providers: [
    { provide: OIDC_REPOSITORY, useClass: KyselyOidcRepository },
    KeysService,
    OidcService,
    ClientsService,
  ],
})
export class OidcModule {}
