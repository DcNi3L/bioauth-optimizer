import { Module } from '@nestjs/common';

import {
  CreateFactorCatalogUseCase,
  DeleteFactorCatalogUseCase,
  GetFactorCatalogUseCase,
  ListFactorCatalogsUseCase,
  ReplaceFactorCatalogUseCase,
} from './application/factor-catalog.use-cases';
import { FACTOR_CATALOG_READER, FACTOR_CATALOG_REPOSITORY } from './application/ports';
import { KyselyFactorCatalogRepository } from './infrastructure/kysely-factor-catalog.repository';
import { FactorCatalogsController } from './presentation/factor-catalogs.controller';

@Module({
  controllers: [FactorCatalogsController],
  providers: [
    KyselyFactorCatalogRepository,
    { provide: FACTOR_CATALOG_REPOSITORY, useExisting: KyselyFactorCatalogRepository },
    { provide: FACTOR_CATALOG_READER, useExisting: KyselyFactorCatalogRepository },
    ListFactorCatalogsUseCase,
    GetFactorCatalogUseCase,
    CreateFactorCatalogUseCase,
    ReplaceFactorCatalogUseCase,
    DeleteFactorCatalogUseCase,
  ],
  exports: [FACTOR_CATALOG_READER],
})
export class FactorCatalogsModule {}
