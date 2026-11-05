import { Global, Module } from '@nestjs/common';

import { SESSION_READER } from '../../shared/auth/auth';
import { AccountService } from './application/account.service';
import {
  BootstrapAdmin,
  LogoutUseCase,
  PasswordLoginUseCase,
  RegisterSubjectUseCase,
} from './application/identity.use-cases';
import {
  AVATAR_STORE,
  LOGIN_EVENTS,
  PASSWORD_HASHER,
  SESSION_STORE,
  USER_REPOSITORY,
} from './application/ports';
import { SessionIssuer } from './application/session-issuer';
import { KyselyAvatarStore } from './infrastructure/kysely-avatar.store';
import {
  KyselyLoginEvents,
  KyselySessionStore,
  KyselyUserRepository,
} from './infrastructure/kysely-identity.repository';
import { MeQuery } from './infrastructure/me.query';
import { ScryptPasswordHasher } from './infrastructure/scrypt-password-hasher';
import { AccountController, AvatarController } from './presentation/account.controller';
import { IdentityController } from './presentation/identity.controller';

/** Глобальный: охранник читает сессии, другие модули выпускают их (SessionIssuer) и читают пользователей. */
@Global()
@Module({
  controllers: [IdentityController, AccountController, AvatarController],
  providers: [
    KyselySessionStore,
    { provide: USER_REPOSITORY, useClass: KyselyUserRepository },
    { provide: SESSION_STORE, useExisting: KyselySessionStore },
    { provide: SESSION_READER, useExisting: KyselySessionStore },
    { provide: PASSWORD_HASHER, useClass: ScryptPasswordHasher },
    { provide: LOGIN_EVENTS, useClass: KyselyLoginEvents },
    { provide: AVATAR_STORE, useClass: KyselyAvatarStore },
    AccountService,
    SessionIssuer,
    MeQuery,
    RegisterSubjectUseCase,
    PasswordLoginUseCase,
    LogoutUseCase,
    BootstrapAdmin,
  ],
  exports: [
    PASSWORD_HASHER,
    SESSION_READER,
    SESSION_STORE,
    USER_REPOSITORY,
    LOGIN_EVENTS,
    AVATAR_STORE,
    SessionIssuer,
    MeQuery,
    AccountService,
  ],
})
export class IdentityModule {}
