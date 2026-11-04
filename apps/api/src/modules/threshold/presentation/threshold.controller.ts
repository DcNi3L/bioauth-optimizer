import {
  type ThresholdOptimizeCommand,
  thresholdOptimizeRequestSchema,
  type ThresholdOptimizeResponse,
  thresholdOptimizeResponseSchema,
} from '@bioauth/contracts';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { OptimizeThresholdUseCase } from '../application/optimize-threshold.use-case';

@ApiTags('Порог')
@Controller('threshold')
export class ThresholdController {
  constructor(private readonly optimize: OptimizeThresholdUseCase) {}

  @Post('optimize')
  @HttpCode(200)
  @ApiOperation({ summary: 'Оптимальный порог по минимуму байесовской стоимости (формула 1 СРО1)' })
  @ApiZodBody(thresholdOptimizeRequestSchema)
  @ApiZodOk(thresholdOptimizeResponseSchema)
  run(
    @Body(new ZodValidationPipe(thresholdOptimizeRequestSchema)) cmd: ThresholdOptimizeCommand,
  ): Promise<ThresholdOptimizeResponse> {
    return this.optimize.execute(cmd);
  }
}
