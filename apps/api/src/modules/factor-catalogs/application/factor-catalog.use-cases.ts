import { Inject, Injectable } from '@nestjs/common';
import type { FactorCatalogDto, FactorCatalogListDto, FactorCatalogUpsertCommand } from '@bioauth/contracts';
import { ConflictError, NotFoundError } from '../../../shared/errors';
import { FACTOR_CATALOG_REPOSITORY, type FactorCatalogRepository } from './ports';

@Injectable()
export class ListFactorCatalogsUseCase {
  constructor(@Inject(FACTOR_CATALOG_REPOSITORY) private readonly repo: FactorCatalogRepository) {}
  async execute(): Promise<FactorCatalogListDto> {
    return { items: await this.repo.list() };
  }
}

@Injectable()
export class GetFactorCatalogUseCase {
  constructor(@Inject(FACTOR_CATALOG_REPOSITORY) private readonly repo: FactorCatalogRepository) {}
  async execute(id: string): Promise<FactorCatalogDto> {
    const c = await this.repo.findById(id);
    if (!c) throw new NotFoundError(`каталог ${id} не найден`);
    return c;
  }
}

@Injectable()
export class CreateFactorCatalogUseCase {
  constructor(@Inject(FACTOR_CATALOG_REPOSITORY) private readonly repo: FactorCatalogRepository) {}
  execute(cmd: FactorCatalogUpsertCommand): Promise<FactorCatalogDto> {
    return this.repo.create(cmd);
  }
}

@Injectable()
export class ReplaceFactorCatalogUseCase {
  constructor(@Inject(FACTOR_CATALOG_REPOSITORY) private readonly repo: FactorCatalogRepository) {}
  async execute(id: string, cmd: FactorCatalogUpsertCommand): Promise<FactorCatalogDto> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError(`каталог ${id} не найден`);
    if (existing.isPreset) throw new ConflictError('предустановленный каталог нельзя изменить — создайте копию');
    const updated = await this.repo.replace(id, cmd);
    if (!updated) throw new NotFoundError(`каталог ${id} не найден`);
    return updated;
  }
}

@Injectable()
export class DeleteFactorCatalogUseCase {
  constructor(@Inject(FACTOR_CATALOG_REPOSITORY) private readonly repo: FactorCatalogRepository) {}
  async execute(id: string): Promise<void> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new NotFoundError(`каталог ${id} не найден`);
    if (existing.isPreset) throw new ConflictError('предустановленный каталог нельзя удалить');
    await this.repo.delete(id);
  }
}
