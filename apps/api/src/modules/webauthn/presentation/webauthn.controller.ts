import { webauthnResponseSchema, type z } from '@bioauth/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthUser, CurrentUser } from '../../../shared/auth/auth';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { PasskeyService } from '../application/passkey.use-cases';

const responsePipe = new ZodValidationPipe(webauthnResponseSchema);

@ApiTags('Passkey (WebAuthn)')
@Controller('webauthn')
export class WebAuthnController {
  constructor(private readonly passkeys: PasskeyService) {}

  @Post('register/options')
  @HttpCode(200)
  @ApiOperation({ summary: 'Опции регистрации passkey для navigator.credentials.create (UC-3)' })
  registerOptions(@CurrentUser() user: AuthUser) {
    return this.passkeys.registrationOptions(user);
  }

  @Post('register/verify')
  @HttpCode(201)
  @ApiOperation({ summary: 'Проверка ответа аутентификатора и сохранение passkey' })
  registerVerify(
    @CurrentUser() user: AuthUser,
    @Body(responsePipe) body: z.infer<typeof webauthnResponseSchema>,
  ) {
    return this.passkeys.verifyRegistration(user, body);
  }

  @Get('credentials')
  @ApiOperation({ summary: 'Мои passkey' })
  credentials(@CurrentUser() user: AuthUser) {
    return this.passkeys.list(user);
  }

  @Delete('credentials/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Удалить свой passkey' })
  async deleteCredential(@CurrentUser() user: AuthUser, @Param('id') id: string): Promise<void> {
    await this.passkeys.remove(user, id);
  }

  @Post('staff/options')
  @HttpCode(200)
  @ApiOperation({ summary: 'Второй фактор сотрудника: опции navigator.credentials.get' })
  staffOptions(@CurrentUser() user: AuthUser) {
    return this.passkeys.staffLoginOptions(user);
  }

  @Post('staff/verify')
  @HttpCode(200)
  @ApiOperation({ summary: 'Второй фактор сотрудника: проверка подписи; сессия получает полный доступ' })
  staffVerify(
    @CurrentUser() user: AuthUser,
    @Body(responsePipe) body: z.infer<typeof webauthnResponseSchema>,
  ) {
    return this.passkeys.staffLoginVerify(user, body);
  }
}
