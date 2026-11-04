import { Controller, Get, Param, Query } from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import {
  experimentDetailSchema,
  experimentListQuerySchema,
  experimentListSchema,
  type ExperimentDetailDto,
  type ExperimentListDto,
  type ExperimentListQuery,
} from '@bioauth/contracts';
import { ApiZodOk } from '../../../shared/swagger/api-zod';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { GetExperimentUseCase, ListExperimentsUseCase } from '../application/experiment-queries';

@ApiTags('Эксперименты')
@Controller('experiments')
export class ExperimentsController {
  constructor(
    private readonly listExperiments: ListExperimentsUseCase,
    private readonly getExperiment: GetExperimentUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'История экспериментов (keyset-пагинация)' })
  @ApiQuery({ name: 'type', required: false, enum: ['THRESHOLD', 'FACTOR_SELECTION', 'BUDGET_SWEEP'] })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'cursor', required: false, type: String })
  @ApiZodOk(experimentListSchema)
  list(@Query(new ZodValidationPipe(experimentListQuerySchema)) query: ExperimentListQuery): Promise<ExperimentListDto> {
    return this.listExperiments.execute(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Эксперимент целиком: вход и результат' })
  @ApiZodOk(experimentDetailSchema)
  get(@Param('id', UuidPipe) id: string): Promise<ExperimentDetailDto> {
    return this.getExperiment.execute(id);
  }
}
