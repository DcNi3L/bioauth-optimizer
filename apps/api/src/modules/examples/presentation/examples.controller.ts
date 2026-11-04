import type { Sro1ExamplesDto } from '@bioauth/contracts';
import { SRO1_FACTOR_EXAMPLE, SRO1_THRESHOLD_EXAMPLE } from '@bioauth/optimization-core';
import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

@ApiTags('Примеры')
@Controller('examples')
export class ExamplesController {
  @Get('sro1')
  @ApiOperation({ summary: 'Модельный пример раздела 4 статьи СРО1 в формате запросов API' })
  sro1(): Sro1ExamplesDto {
    const t = SRO1_THRESHOLD_EXAMPLE;
    const f = SRO1_FACTOR_EXAMPLE;
    return {
      source:
        'Мекенбаев Д. К. Многокритериальная оптимизация параметров систем биометрической аутентификации (СРО1), раздел 4',
      threshold: {
        model: { kind: 'gaussian', genuine: t.genuine, impostor: t.impostor },
        costs: t.costs,
        constraints: { farMax: null },
        curve: { points: 201, from: 0.3, to: 0.8 },
      },
      factorSelection: {
        factors: f.factors.map((x) => ({ ...x })),
        costs: f.costs,
        constraints: { ...f.constraints },
        fusionRule: 'AND',
        solver: 'auto',
        rankingLimit: 100,
      },
    };
  }
}
