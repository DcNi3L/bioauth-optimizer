import {
  type ConsentTextDto,
  consentTextSchema,
  grantConsentRequestSchema,
  type z,
} from '@bioauth/contracts';
import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthUser, CurrentUser, Public } from '../../../shared/auth/auth';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { ConsentService } from '../application/consent.use-cases';

@ApiTags('Согласие')
@Controller('consent')
export class ConsentController {
  constructor(private readonly consent: ConsentService) {}

  @Public()
  @Get('text')
  @ApiOperation({ summary: 'Актуальный текст согласия' })
  @ApiZodOk(consentTextSchema)
  text(): ConsentTextDto {
    return this.consent.currentText();
  }

  @Post()
  @HttpCode(204)
  @ApiOperation({ summary: 'Дать согласие (UC-1)' })
  @ApiZodBody(grantConsentRequestSchema)
  async grant(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(grantConsentRequestSchema)) body: z.infer<typeof grantConsentRequestSchema>,
  ): Promise<void> {
    await this.consent.grant(user.id, body.textVersion);
  }

  @Delete()
  @ApiOperation({ summary: 'Отозвать согласие: биометрия удаляется, статистика обезличивается (UC-5)' })
  revoke(@CurrentUser() user: AuthUser) {
    return this.consent.revoke(user.id);
  }
}
