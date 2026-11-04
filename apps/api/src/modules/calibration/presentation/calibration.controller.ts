import {
  type AttemptsPageDto,
  attemptsPageSchema,
  calibrateRequestSchema,
  calibrateResponseSchema,
  calibrationOverviewSchema,
  createMeasuredCatalogSchema,
  measuredFactorsSchema,
  padReportSchema,
  type PadSampleRequest,
  padSampleRequestSchema,
  padSampleResponseSchema,
  proposeFromCalibrationSchema,
  z,
} from '@bioauth/contracts';
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthUser, CurrentUser, RequireMfa, Roles } from '../../../shared/auth/auth';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { AttemptsService } from '../application/attempts.service';
import { CalibrationService } from '../application/calibration.service';
import { DriftService } from '../application/drift.service';
import { PadTestService } from '../application/pad-test.service';
import { DRIFT_ALERTS, type DriftAlertRepository } from '../application/ports';

const isoOrNull = (v: string | undefined, path: string): string | null => {
  if (v === undefined || v === '') return null;
  if (Number.isNaN(Date.parse(v))) throw new ValidationError(`${path}: ожидается дата ISO 8601`, path);
  return new Date(v).toISOString();
};

@ApiTags('Калибровка')
@Controller('calibration')
export class CalibrationController {
  constructor(
    private readonly calibration: CalibrationService,
    private readonly driftService: DriftService,
  ) {}

  @Get('overview')
  @Roles('admin', 'researcher', 'auditor')
  @ApiOperation({ summary: 'Накопленные оценки по версиям моделей, активная политика, уведомления о дрейфе' })
  @ApiZodOk(calibrationOverviewSchema)
  overview() {
    return this.calibration.overview();
  }

  @Post('threshold')
  @HttpCode(200)
  @Roles('admin', 'researcher')
  @ApiOperation({ summary: 'Калибровка порога ядром v1 по накопленным оценкам (UC-6)' })
  @ApiZodBody(calibrateRequestSchema)
  @ApiZodOk(calibrateResponseSchema)
  threshold(
    @Body(new ZodValidationPipe(calibrateRequestSchema)) body: z.output<typeof calibrateRequestSchema>,
  ) {
    return this.calibration.calibrate(body);
  }

  @Post('propose')
  @HttpCode(201)
  @Roles('admin', 'researcher')
  @RequireMfa()
  @ApiOperation({ summary: 'Предложить политику с порогами из экспериментов калибровки' })
  @ApiZodBody(proposeFromCalibrationSchema)
  propose(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(proposeFromCalibrationSchema))
    body: z.output<typeof proposeFromCalibrationSchema>,
  ) {
    return this.calibration.propose(user, body);
  }

  @Get('factors')
  @Roles('admin', 'researcher', 'auditor')
  @ApiOperation({ summary: 'Измеренные FAR, FRR и задержка факторов (UC-7)' })
  @ApiZodOk(measuredFactorsSchema)
  factors(@Query('from') from?: string, @Query('to') to?: string) {
    return this.calibration.measuredFactors(isoOrNull(from, 'from'), isoOrNull(to, 'to'));
  }

  @Post('factors/catalog')
  @HttpCode(201)
  @Roles('admin', 'researcher')
  @ApiOperation({ summary: 'Создать каталог факторов из измерений — для решателя состава факторов v1' })
  @ApiZodBody(createMeasuredCatalogSchema)
  catalog(
    @Body(new ZodValidationPipe(createMeasuredCatalogSchema))
    body: z.output<typeof createMeasuredCatalogSchema>,
  ) {
    return this.calibration.createMeasuredCatalog(body);
  }

  @Post('drift/check')
  @HttpCode(200)
  @Roles('admin', 'researcher')
  @ApiOperation({ summary: 'Проверить дрейф FRR сейчас (обычно выполняется по расписанию)' })
  checkDrift() {
    return this.driftService.check();
  }
}

@ApiTags('Калибровка')
@Controller('calibration/drift')
export class DriftController {
  constructor(@Inject(DRIFT_ALERTS) private readonly alerts: DriftAlertRepository) {}

  @Post(':id/acknowledge')
  @HttpCode(204)
  @Roles('admin')
  async acknowledge(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string): Promise<void> {
    if (!(await this.alerts.acknowledge(id, user.id)))
      throw new NotFoundError('уведомление не найдено или уже принято');
  }
}

@ApiTags('Испытание PAD')
@Controller('pad-test')
export class PadTestController {
  constructor(private readonly pad: PadTestService) {}

  @Post('samples')
  @HttpCode(201)
  @Roles('admin', 'researcher')
  @ApiOperation({ summary: 'Записать предъявление: подлинное или атака указанного вида (UC-8)' })
  @ApiZodBody(padSampleRequestSchema)
  @ApiZodOk(padSampleResponseSchema)
  record(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(padSampleRequestSchema)) body: PadSampleRequest,
  ) {
    return this.pad.record(user, body);
  }

  @Get('report')
  @Roles('admin', 'researcher', 'auditor')
  @ApiOperation({ summary: 'APCER по видам атак и BPCER при пороге (ISO/IEC 30107-3)' })
  @ApiZodOk(padReportSchema)
  report(@Query('padVersion') padVersion?: string, @Query('threshold') threshold?: string) {
    const t = threshold === undefined || threshold === '' ? null : Number(threshold);
    if (t !== null && !(t >= 0 && t <= 1)) throw new ValidationError('threshold: от 0 до 1', 'threshold');
    return this.pad.report(padVersion ?? null, t);
  }
}

const attemptsQuery = z.object({
  factor: z.enum(['face', 'passkey']).optional(),
  outcome: z.enum(['accept', 'reject', 'error', 'cancel']).optional(),
  from: z.iso.datetime({ offset: true }).optional(),
  to: z.iso.datetime({ offset: true }).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
});

@ApiTags('Журнал попыток')
@Controller('attempts')
export class AttemptsController {
  constructor(private readonly attempts: AttemptsService) {}

  @Get()
  @Roles('admin', 'researcher', 'auditor')
  @ApiOperation({ summary: 'Попытки входа с фильтрами и агрегаты FRR, FTA, задержки p50/p95' })
  @ApiZodOk(attemptsPageSchema)
  list(
    @CurrentUser() user: AuthUser,
    @Query(new ZodValidationPipe(attemptsQuery)) q: z.output<typeof attemptsQuery>,
  ): Promise<AttemptsPageDto> {
    return this.attempts.page(user, q);
  }
}
