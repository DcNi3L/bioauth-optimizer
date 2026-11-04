import {
  type FactorCatalogDto,
  type FactorCatalogListDto,
  factorCatalogListSchema,
  factorCatalogSchema,
  type FactorCatalogUpsertCommand,
  factorCatalogUpsertSchema,
} from '@bioauth/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Post, Put } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Public } from '../../../shared/auth/auth';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import {
  CreateFactorCatalogUseCase,
  DeleteFactorCatalogUseCase,
  GetFactorCatalogUseCase,
  ListFactorCatalogsUseCase,
  ReplaceFactorCatalogUseCase,
} from '../application/factor-catalog.use-cases';

const upsertPipe = new ZodValidationPipe(factorCatalogUpsertSchema);

@ApiTags('Каталоги факторов')
// v1 — расчётный инструмент проектировщика, открыт без входа (ADR-0005); v2 закрыт по умолчанию.
@Public()
@Controller('factor-catalogs')
export class FactorCatalogsController {
  constructor(
    private readonly listCatalogs: ListFactorCatalogsUseCase,
    private readonly getCatalog: GetFactorCatalogUseCase,
    private readonly createCatalog: CreateFactorCatalogUseCase,
    private readonly replaceCatalog: ReplaceFactorCatalogUseCase,
    private readonly deleteCatalog: DeleteFactorCatalogUseCase,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Список каталогов факторов' })
  @ApiZodOk(factorCatalogListSchema)
  list(): Promise<FactorCatalogListDto> {
    return this.listCatalogs.execute();
  }

  @Get(':id')
  @ApiZodOk(factorCatalogSchema)
  get(@Param('id', UuidPipe) id: string): Promise<FactorCatalogDto> {
    return this.getCatalog.execute(id);
  }

  @Post()
  @HttpCode(201)
  @ApiOperation({ summary: 'Создать каталог' })
  @ApiZodBody(factorCatalogUpsertSchema)
  @ApiZodOk(factorCatalogSchema)
  create(@Body(upsertPipe) cmd: FactorCatalogUpsertCommand): Promise<FactorCatalogDto> {
    return this.createCatalog.execute(cmd);
  }

  @Put(':id')
  @ApiOperation({ summary: 'Заменить каталог целиком (предустановленные — только чтение)' })
  @ApiZodBody(factorCatalogUpsertSchema)
  @ApiZodOk(factorCatalogSchema)
  replace(
    @Param('id', UuidPipe) id: string,
    @Body(upsertPipe) cmd: FactorCatalogUpsertCommand,
  ): Promise<FactorCatalogDto> {
    return this.replaceCatalog.execute(id, cmd);
  }

  @Delete(':id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Удалить каталог (ссылки из экспериментов обнуляются)' })
  remove(@Param('id', UuidPipe) id: string): Promise<void> {
    return this.deleteCatalog.execute(id);
  }
}
