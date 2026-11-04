import {
  type MeDto,
  meSchema,
  passwordLoginRequestSchema,
  type RegisterSubjectRequest,
  registerSubjectRequestSchema,
  type z,
} from '@bioauth/contracts';
import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import {
  type AuthUser,
  clearSessionCookie,
  CurrentUser,
  Public,
  readCookie,
  SESSION_COOKIE,
  setSessionCookie,
} from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import {
  LogoutUseCase,
  PasswordLoginUseCase,
  RegisterSubjectUseCase,
} from '../application/identity.use-cases';
import { MeQuery } from '../infrastructure/me.query';

@ApiTags('Пользователи и вход')
@Controller('identity')
export class IdentityController {
  constructor(
    private readonly register: RegisterSubjectUseCase,
    private readonly passwordLogin: PasswordLoginUseCase,
    private readonly logout: LogoutUseCase,
    private readonly meQuery: MeQuery,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('subjects')
  @HttpCode(201)
  @ApiOperation({ summary: 'Регистрация субъекта (участника); выдаёт сессию' })
  @ApiZodBody(registerSubjectRequestSchema)
  async registerSubject(
    @Body(new ZodValidationPipe(registerSubjectRequestSchema)) body: RegisterSubjectRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ ok: true }> {
    const s = await this.register.execute(body);
    setSessionCookie(res, s.token, s.maxAgeMs, this.config.COOKIE_SECURE);
    return { ok: true };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Вход сотрудника по паролю (затем — passkey, если требуется)' })
  @ApiZodBody(passwordLoginRequestSchema)
  async login(
    @Body(new ZodValidationPipe(passwordLoginRequestSchema)) body: z.infer<typeof passwordLoginRequestSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ mfaRequired: boolean }> {
    const s = await this.passwordLogin.execute(body.login, body.password);
    setSessionCookie(res, s.token, s.maxAgeMs, this.config.COOKIE_SECURE);
    return { mfaRequired: s.mfaRequired };
  }

  @Public()
  @Post('logout')
  @HttpCode(204)
  @ApiOperation({ summary: 'Выход: сессия удаляется на сервере' })
  async logoutRoute(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.logout.execute(readCookie(req, SESSION_COOKIE));
    clearSessionCookie(res, this.config.COOKIE_SECURE);
  }

  @Get('me')
  @ApiOperation({ summary: 'Текущий пользователь: роль, согласие, шаблон, passkey' })
  @ApiZodOk(meSchema)
  me(@CurrentUser() user: AuthUser): Promise<MeDto> {
    return this.meQuery.me(user);
  }
}
