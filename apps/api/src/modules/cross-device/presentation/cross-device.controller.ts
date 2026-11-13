import {
  crossDeviceDecisionSchema,
  type CrossDeviceDetailsDto,
  crossDeviceDetailsSchema,
  crossDevicePollSchema,
  type CrossDeviceStartDto,
  crossDeviceStartSchema,
  type CrossDeviceStatusDto,
  crossDeviceStatusSchema,
  z,
} from '@bioauth/contracts';
import { Body, Controller, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { type AuthUser, CurrentUser, Public, setSessionCookie } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { CrossDeviceService } from '../application/cross-device.service';

type Poll = z.infer<typeof crossDevicePollSchema>;
type Decision = z.infer<typeof crossDeviceDecisionSchema>;

/** Вход на компьютере с подтверждением на телефоне по QR-коду (#40). Секреты передаются только в теле запроса. */
@ApiTags('Вход с другого устройства')
@Controller('cross-device')
export class CrossDeviceController {
  constructor(
    private readonly service: CrossDeviceService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Post()
  @Public()
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Компьютер: новый запрос входа (QR-код, число для сверки, срок 2 минуты)' })
  @ApiZodOk(crossDeviceStartSchema)
  start(): Promise<CrossDeviceStartDto> {
    return this.service.start();
  }

  @Post(':id/status')
  @Public()
  @HttpCode(200)
  @Throttle({ default: { limit: 120, ttl: 60_000 } })
  @ApiOperation({ summary: 'Компьютер: состояние запроса (опрос раз в 2 секунды)' })
  @ApiZodBody(crossDevicePollSchema)
  @ApiZodOk(crossDeviceStatusSchema)
  status(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(crossDevicePollSchema)) body: Poll,
  ): Promise<CrossDeviceStatusDto> {
    return this.service.status(id, body.pollSecret);
  }

  @Post(':id/complete')
  @Public()
  @HttpCode(204)
  @ApiOperation({ summary: 'Компьютер: получить сессию после подтверждения (один раз)' })
  @ApiZodBody(crossDevicePollSchema)
  async complete(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(crossDevicePollSchema)) body: Poll,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    const s = await this.service.complete(id, body.pollSecret);
    setSessionCookie(res, s.token, s.maxAgeMs, this.config.COOKIE_SECURE);
  }

  @Post(':id/details')
  @HttpCode(200)
  @ApiOperation({ summary: 'Телефон: откуда запрошен вход и три числа на выбор' })
  @ApiZodBody(crossDeviceDecisionSchema)
  @ApiZodOk(crossDeviceDetailsSchema)
  details(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(crossDeviceDecisionSchema)) body: Decision,
  ): Promise<CrossDeviceDetailsDto> {
    return this.service.details(user, id, body.key);
  }

  @Post(':id/approve')
  @HttpCode(204)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Телефон: подтвердить вход, выбрав число с экрана компьютера' })
  @ApiZodBody(crossDeviceDecisionSchema)
  approve(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(crossDeviceDecisionSchema)) body: Decision,
  ): Promise<void> {
    return this.service.approve(user, id, body.key, body.number);
  }

  @Post(':id/deny')
  @HttpCode(204)
  @ApiOperation({ summary: 'Телефон: отклонить запрос («это не я»)' })
  @ApiZodBody(crossDeviceDecisionSchema)
  deny(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(crossDeviceDecisionSchema)) body: Decision,
  ): Promise<void> {
    return this.service.deny(user, id, body.key);
  }
}
