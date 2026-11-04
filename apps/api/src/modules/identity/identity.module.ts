import { Global, Module } from '@nestjs/common';

import { SESSION_READER } from '../../shared/auth/auth';
import {
  BootstrapAdmin,
  LogoutUseCase,
  PasswordLoginUseCase,
  RegisterSubjectUseCase,
} from './application/identity.use-cases';
import { PASSWORD_HASHER, SESSION_STORE, USER_REPOSITORY } from './application/ports';
import { SessionIssuer } from './application/session-issuer';
import { KyselySessionStore, KyselyUserRepository } from './infrastructure/kysely-identity.repository';
import { MeQuery } from './infrastructure/me.query';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';
import { IdentityController } from './presentation/identity.controller';

/** Глобальный: охранник читает сессии, другие модули выпускают их (SessionIssuer) и читают пользователей. */
@Global()
@Module({
  controllers: [IdentityController],
  providers: [
    KyselySessionStore,
    { provide: USER_REPOSITORY, useClass: KyselyUserRepository },
    { provide: SESSION_STORE, useExisting: KyselySessionStore },
    { provide: SESSION_READER, useExisting: KyselySessionStore },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    SessionIssuer,
    MeQuery,
    RegisterSubjectUseCase,
    PasswordLoginUseCase,
    LogoutUseCase,
    BootstrapAdmin,
  ],
  exports: [SESSION_READER, SESSION_STORE, USER_REPOSITORY, SessionIssuer, MeQuery],
})
export class IdentityModule {}
