import {
  type AttemptsPageDto,
  attemptsPageSchema,
  type BatchJobDto,
  batchJobRequestSchema,
  batchJobSchema,
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
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Query,
  Res,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBody, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response as ExpressResponse } from 'express';

import { type AuthUser, CurrentUser, RequireMfa, Roles } from '../../../shared/auth/auth';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { AttemptsService } from '../application/attempts.service';
import { BatchJobsService } from '../application/batch-jobs.service';
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

@ApiTags('Пакетный режим')
@Controller('calibration/batch')
export class BatchController {
  constructor(private readonly batch: BatchJobsService) {}

  @Post()
  @HttpCode(202)
  @Roles('admin', 'researcher')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Пакетная оценка: zip «<субъект>/<файл>» → набор оценок для расчёта порога (UC-9)',
    description:
      'Задача выполняется в фоне; состояние — GET /calibration/batch/{id}. Genuine — все пары изображений ' +
      'одного субъекта; impostor — все пары разных субъектов или выборка maxImpostor с seed.',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    schema: {
      type: 'object',
      required: ['file'],
      properties: {
        file: { type: 'string', format: 'binary' },
        name: { type: 'string' },
        seed: { type: 'integer', default: 0 },
        maxImpostor: { type: 'integer', default: 100000 },
        includeInCalibration: { type: 'boolean', default: false },
      },
    },
  })
  @ApiZodOk(batchJobSchema)
  start(
    @CurrentUser() user: AuthUser,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body(new ZodValidationPipe(batchJobRequestSchema)) body: z.output<typeof batchJobRequestSchema>,
  ): BatchJobDto {
    if (!file) throw new ValidationError('нужно приложить zip-архив в поле file', 'file');
    return this.batch.start(user, {
      archive: file.buffer,
      filename: file.originalname,
      name: body.name,
      seed: body.seed,
      maxImpostor: body.maxImpostor,
      includeInCalibration: body.includeInCalibration,
    });
  }

  @Get()
  @Roles('admin', 'researcher')
  @ApiOperation({ summary: 'Пакетные задачи с момента запуска сервера, новые сверху' })
  list(): BatchJobDto[] {
    return this.batch.list();
  }

  @Get(':id')
  @Roles('admin', 'researcher')
  @ApiZodOk(batchJobSchema)
  get(@Param('id', UuidPipe) id: string): BatchJobDto {
    return this.batch.get(id);
  }

  @Get(':id/csv')
  @Roles('admin', 'researcher')
  @ApiOperation({ summary: 'CSV оценок (score,label) — для воспроизведения расчёта' })
  csv(@Param('id', UuidPipe) id: string, @Res({ passthrough: true }) res: ExpressResponse): StreamableFile {
    const { filename, content } = this.batch.csv(id);
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader('content-disposition', `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`);
    return new StreamableFile(content);
  }

  @Delete(':id')
  @HttpCode(204)
  @Roles('admin', 'researcher')
  @ApiOperation({ summary: 'Отменить выполняющуюся задачу' })
  cancel(@Param('id', UuidPipe) id: string): void {
    this.batch.cancel(id);
  }
}
