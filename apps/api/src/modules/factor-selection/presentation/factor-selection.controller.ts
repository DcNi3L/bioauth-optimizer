import {
  type BudgetSweepCommand,
  budgetSweepRequestSchema,
  type BudgetSweepResponse,
  budgetSweepResponseSchema,
  type FactorSelectionCommand,
  factorSelectionRequestSchema,
  type FactorSelectionResponse,
  factorSelectionResponseSchema,
} from '@bioauth/contracts';
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../../shared/auth/auth';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { BudgetSweepUseCase } from '../application/budget-sweep.use-case';
import { SolveFactorSelectionUseCase } from '../application/solve-factor-selection.use-case';

@ApiTags('Состав факторов')
// v1 — расчётный инструмент проектировщика, открыт без входа (ADR-0005); v2 закрыт по умолчанию.
@Public()
@Controller('factor-selection')
export class FactorSelectionController {
  constructor(
    private readonly solveUseCase: SolveFactorSelectionUseCase,
    private readonly sweepUseCase: BudgetSweepUseCase,
  ) {}

  @Post('solve')
  @HttpCode(200)
  @ApiOperation({
    summary: 'Оптимальный состав факторов: полный перебор или сертифицированное ЦЛП (формулы 2–3 СРО1)',
  })
  @ApiZodBody(factorSelectionRequestSchema)
  @ApiZodOk(factorSelectionResponseSchema)
  solve(
    @Body(new ZodValidationPipe(factorSelectionRequestSchema)) cmd: FactorSelectionCommand,
  ): Promise<FactorSelectionResponse> {
    return this.solveUseCase.execute(cmd);
  }

  @Post('budget-sweep')
  @HttpCode(200)
  @ApiOperation({ summary: 'Анализ чувствительности оптимума к бюджету' })
  @ApiZodBody(budgetSweepRequestSchema)
  @ApiZodOk(budgetSweepResponseSchema)
  sweep(
    @Body(new ZodValidationPipe(budgetSweepRequestSchema)) cmd: BudgetSweepCommand,
  ): Promise<BudgetSweepResponse> {
    return this.sweepUseCase.execute(cmd);
  }
}
