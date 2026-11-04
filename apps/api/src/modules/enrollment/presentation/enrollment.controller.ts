import {
  type EnrollFaceRequest,
  enrollFaceRequestSchema,
  enrollFaceResponseSchema,
} from '@bioauth/contracts';
import { Body, Controller, Delete, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { type AuthUser, CurrentUser } from '../../../shared/auth/auth';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { DeleteFaceUseCase, EnrollFaceUseCase, type EnrollResult } from '../application/enroll-face.use-case';

@ApiTags('Регистрация биометрии')
@Controller('enrollment')
export class EnrollmentController {
  constructor(
    private readonly enroll: EnrollFaceUseCase,
    private readonly remove: DeleteFaceUseCase,
  ) {}

  @Post('face')
  @HttpCode(201)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @ApiOperation({ summary: 'Регистрация лица по 3–10 кадрам (UC-2); нужен вход и согласие' })
  @ApiZodBody(enrollFaceRequestSchema)
  @ApiZodOk(enrollFaceResponseSchema)
  face(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(enrollFaceRequestSchema)) body: EnrollFaceRequest,
  ): Promise<EnrollResult> {
    return this.enroll.execute(user.id, body.frames);
  }

  @Delete('face')
  @ApiOperation({ summary: 'Удалить шаблон лица' })
  deleteFace(@CurrentUser() user: AuthUser): Promise<{ deleted: boolean }> {
    return this.remove.execute(user.id);
  }
}
