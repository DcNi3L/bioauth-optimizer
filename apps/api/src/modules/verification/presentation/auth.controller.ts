import {
  type AuthSessionDto,
  authSessionSchema,
  type AuthStepResultDto,
  authStepResultSchema,
  type PosePreviewDto,
  type PosePreviewRequest,
  posePreviewRequestSchema,
  posePreviewSchema,
  startAuthRequestSchema,
  type SubmitFaceRequest,
  submitFaceRequestSchema,
  webauthnResponseSchema,
  z,
} from '@bioauth/contracts';
import { Body, Controller, HttpCode, Inject, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import type { Response } from 'express';

import { Public, setSessionCookie } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { PosePreviewService } from '../../biometrics/application/pose-preview';
import { AuthService, type StepOutcome } from '../application/auth.service';

const cancelSchema = z.strictObject({ durationMs: z.number().int().min(0).max(600_000) });

/** Вход субъекта по активной политике (UC-4). Все методы открыты: сессия создаётся по результату. */
@ApiTags('Вход по политике')
@Public()
@Throttle({ default: { limit: 30, ttl: 60_000 } })
@Controller('auth/sessions')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly pose: PosePreviewService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private respond(res: Response, o: StepOutcome): AuthStepResultDto {
    if (o.session) setSessionCookie(res, o.session.token, o.session.maxAgeMs, this.config.COOKIE_SECURE);
    return o.result;
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Начать вход: шаги политики и 3 случайные команды; срок жизни 3 минуты' })
  @ApiZodBody(startAuthRequestSchema)
  @ApiZodOk(authSessionSchema)
  start(
    @Body(new ZodValidationPipe(startAuthRequestSchema)) body: z.infer<typeof startAuthRequestSchema>,
  ): Promise<AuthSessionDto> {
    return this.auth.start(body.login);
  }

  @Post(':id/pose')
  @HttpCode(200)
  @Throttle({ default: { limit: 600, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Живая подсказка позы по одному кадру (решение не принимается, кадр не хранится)',
  })
  @ApiZodBody(posePreviewRequestSchema)
  @ApiZodOk(posePreviewSchema)
  async posePreview(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(posePreviewRequestSchema)) body: PosePreviewRequest,
  ): Promise<PosePreviewDto> {
    await this.auth.assertPoseAllowed(id);
    return this.pose.preview(body);
  }

  @Post(':id/face')
  @HttpCode(200)
  @ApiOperation({ summary: 'Шаг «лицо»: нейтральные кадры и кадры каждой команды' })
  @ApiZodBody(submitFaceRequestSchema)
  @ApiZodOk(authStepResultSchema)
  async face(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(submitFaceRequestSchema)) body: SubmitFaceRequest,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthStepResultDto> {
    return this.respond(res, await this.auth.submitFace(id, body));
  }

  @Post(':id/passkey/options')
  @HttpCode(200)
  @ApiOperation({ summary: 'Шаг «passkey»: опции navigator.credentials.get' })
  passkeyOptions(@Param('id', UuidPipe) id: string) {
    return this.auth.passkeyOptions(id);
  }

  @Post(':id/passkey/verify')
  @HttpCode(200)
  @ApiZodOk(authStepResultSchema)
  async passkeyVerify(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(webauthnResponseSchema)) body: z.infer<typeof webauthnResponseSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthStepResultDto> {
    return this.respond(res, await this.auth.passkeyVerify(id, body));
  }

  @Post(':id/passkey/cancel')
  @HttpCode(200)
  @ApiOperation({ summary: 'Пользователь отменил passkey — учитывается в FRR фактора' })
  async passkeyCancel(
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(cancelSchema)) body: z.infer<typeof cancelSchema>,
    @Res({ passthrough: true }) res: Response,
  ): Promise<AuthStepResultDto> {
    return this.respond(res, await this.auth.passkeyCancel(id, body.durationMs));
  }
}
