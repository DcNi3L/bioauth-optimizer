import {
  mfaCompleteSchema,
  mfaStatusSchema,
  recoveryCodeRequestSchema,
  recoveryCodesSchema,
  totpCodeRequestSchema,
  totpEnabledSchema,
  totpSetupSchema,
  type z,
} from '@bioauth/contracts';
import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { type AuthUser, CurrentUser, RequireMfa } from '../../../shared/auth/auth';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { MfaService } from '../application/mfa.service';

const codePipe = new ZodValidationPipe(totpCodeRequestSchema);
const recoveryPipe = new ZodValidationPipe(recoveryCodeRequestSchema);
const limit = { default: { limit: 10, ttl: 60_000 } };

@ApiTags('Второй фактор (TOTP)')
@Controller('mfa')
export class MfaController {
  constructor(private readonly mfa: MfaService) {}

  @Get()
  @ApiOperation({ summary: 'Состояние второго фактора: TOTP и число кодов восстановления' })
  @ApiZodOk(mfaStatusSchema)
  status(@CurrentUser() user: AuthUser) {
    return this.mfa.status(user);
  }

  @Post('totp/setup')
  @HttpCode(200)
  @Throttle(limit)
  @ApiOperation({ summary: 'Новый секрет TOTP и otpauth-ссылка для QR-кода' })
  @ApiZodOk(totpSetupSchema)
  setup(@CurrentUser() user: AuthUser) {
    return this.mfa.setup(user);
  }

  @Post('totp/confirm')
  @HttpCode(200)
  @Throttle(limit)
  @ApiOperation({
    summary: 'Подтвердить первым кодом и включить; при первом включении — коды восстановления',
  })
  @ApiZodBody(totpCodeRequestSchema)
  @ApiZodOk(totpEnabledSchema)
  confirm(@CurrentUser() user: AuthUser, @Body(codePipe) body: z.infer<typeof totpCodeRequestSchema>) {
    return this.mfa.confirm(user, body.code);
  }

  @Post('totp/verify')
  @HttpCode(200)
  @Throttle(limit)
  @ApiOperation({
    summary: 'Второй фактор входа сотрудника: код из приложения; сессия получает полный доступ',
  })
  @ApiZodBody(totpCodeRequestSchema)
  @ApiZodOk(mfaCompleteSchema)
  verify(@CurrentUser() user: AuthUser, @Body(codePipe) body: z.infer<typeof totpCodeRequestSchema>) {
    return this.mfa.verifyLogin(user, body.code);
  }

  @Delete('totp')
  @HttpCode(204)
  @Throttle(limit)
  @RequireMfa()
  @ApiOperation({ summary: 'Отключить TOTP (нужен действующий код); коды восстановления удаляются' })
  @ApiZodBody(totpCodeRequestSchema)
  async disable(@CurrentUser() user: AuthUser, @Body(codePipe) body: z.infer<typeof totpCodeRequestSchema>) {
    await this.mfa.disable(user, body.code);
  }

  @Post('recovery/verify')
  @HttpCode(200)
  @Throttle(limit)
  @ApiOperation({ summary: 'Вход сотрудника по коду восстановления; код гасится' })
  @ApiZodBody(recoveryCodeRequestSchema)
  @ApiZodOk(mfaCompleteSchema)
  recover(
    @CurrentUser() user: AuthUser,
    @Body(recoveryPipe) body: z.infer<typeof recoveryCodeRequestSchema>,
  ) {
    return this.mfa.verifyRecovery(user, body.code);
  }

  @Post('recovery/regenerate')
  @HttpCode(200)
  @Throttle(limit)
  @RequireMfa()
  @ApiOperation({
    summary: 'Новый набор кодов восстановления (нужен код из приложения); старые аннулируются',
  })
  @ApiZodBody(totpCodeRequestSchema)
  @ApiZodOk(recoveryCodesSchema)
  regenerate(@CurrentUser() user: AuthUser, @Body(codePipe) body: z.infer<typeof totpCodeRequestSchema>) {
    return this.mfa.regenerate(user, body.code);
  }
}
