import type { FactorCatalogDto, FactorDto } from '@bioauth/contracts';

export const FACTOR_CATALOG_REPOSITORY = Symbol('FACTOR_CATALOG_REPOSITORY');
export const FACTOR_CATALOG_READER = Symbol('FACTOR_CATALOG_READER');

export interface CatalogData {
  readonly name: string;
  readonly description: string | null;
  readonly factors: readonly FactorDto[];
}

export interface FactorCatalogRepository {
  list(): Promise<FactorCatalogDto[]>;
  findById(id: string): Promise<FactorCatalogDto | null>;
  create(data: CatalogData, isPreset?: boolean): Promise<FactorCatalogDto>;
  replace(id: string, data: CatalogData): Promise<FactorCatalogDto | null>;
  delete(id: string): Promise<boolean>;
}

/** Узкий порт чтения факторов для модуля «Состав факторов» (ISP). */
export interface FactorCatalogReader {
  findFactors(catalogId: string): Promise<FactorDto[] | null>;
}
