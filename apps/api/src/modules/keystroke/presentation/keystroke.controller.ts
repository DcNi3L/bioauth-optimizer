import {
  enrollKeystrokeSchema,
  keystrokeEnrolledSchema,
  keystrokeSampleSchema,
  keystrokeStatusSchema,
  keystrokeVerifyResultSchema,
  type z,
} from '@bioauth/contracts';
import { Body, Controller, Delete, Get, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { type AuthUser, CurrentUser } from '../../../shared/auth/auth';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { KeystrokeService } from '../application/keystroke.service';

@ApiTags('Динамика набора')
@Controller('keystroke')
export class KeystrokeController {
  constructor(private readonly keystroke: KeystrokeService) {}

  @Get()
  @ApiOperation({ summary: 'Состояние: зарегистрирован ли ритм набора и какую фразу набирать' })
  @ApiZodOk(keystrokeStatusSchema)
  status(@CurrentUser() user: AuthUser) {
    return this.keystroke.status(user);
  }

  @Post('enroll')
  @HttpCode(201)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Зарегистрировать ритм набора по нескольким повторам фразы (нужно согласие)' })
  @ApiZodBody(enrollKeystrokeSchema)
  @ApiZodOk(keystrokeEnrolledSchema)
  enroll(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(enrollKeystrokeSchema)) body: z.infer<typeof enrollKeystrokeSchema>,
  ) {
    return this.keystroke.enroll(user, body.samples);
  }

  @Post('verify')
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({ summary: 'Проверить ввод фразы по зарегистрированному ритму' })
  @ApiZodBody(keystrokeSampleSchema)
  @ApiZodOk(keystrokeVerifyResultSchema)
  verify(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(keystrokeSampleSchema)) body: z.infer<typeof keystrokeSampleSchema>,
  ) {
    return this.keystroke.verify(user, body);
  }

  @Delete()
  @HttpCode(204)
  @ApiOperation({ summary: 'Удалить зарегистрированный ритм набора' })
  async remove(@CurrentUser() user: AuthUser): Promise<void> {
    await this.keystroke.remove(user);
  }
}
