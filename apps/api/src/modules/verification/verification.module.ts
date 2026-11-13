import { Module } from '@nestjs/common';

import { KeystrokeModule } from '../keystroke/keystroke.module';
import { MfaModule } from '../mfa/mfa.module';
import { AuthService } from './application/auth.service';
import { AUTH_SESSIONS } from './application/ports';
import { KyselyAuthSessionRepository } from './infrastructure/kysely-auth-session.repository';
import { AuthController } from './presentation/auth.controller';

@Module({
  imports: [MfaModule, KeystrokeModule],
  controllers: [AuthController],
  providers: [{ provide: AUTH_SESSIONS, useClass: KyselyAuthSessionRepository }, AuthService],
})
export class VerificationModule {}
