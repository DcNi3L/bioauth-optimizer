import type { FactorCatalogDto, FactorDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';
import type { Selectable, Transaction } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { Database, FactorCatalogTable, FactorTable } from '../../../shared/database/schema';
import { ConflictError } from '../../../shared/errors';
import type { CatalogData, FactorCatalogReader, FactorCatalogRepository } from '../application/ports';

const toFactor = (r: Selectable<FactorTable>): FactorDto => ({
  code: r.code,
  name: r.name,
  far: r.far,
  frr: r.frr,
  latencyMs: r.latency_ms,
  cost: r.cost,
  hasPad: r.has_pad,
  ...(r.provenance ? { provenance: r.provenance } : {}),
});

const isUniqueViolation = (err: unknown) => (err as { code?: string } | null)?.code === '23505';

@Injectable()
export class KyselyFactorCatalogRepository implements FactorCatalogRepository, FactorCatalogReader {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async list(): Promise<FactorCatalogDto[]> {
    const catalogs = await this.db
      .selectFrom('factor_catalog')
      .selectAll()
      .orderBy('is_preset', 'desc')
      .orderBy('created_at', 'asc')
      .execute();
    if (catalogs.length === 0) return [];
    const factors = await this.db
      .selectFrom('factor')
      .selectAll()
      .where(
        'catalog_id',
        'in',
        catalogs.map((c) => c.id),
      )
      .orderBy('position', 'asc')
      .execute();
    return catalogs.map((c) =>
      this.toDto(
        c,
        factors.filter((f) => f.catalog_id === c.id),
      ),
    );
  }

  async findById(id: string): Promise<FactorCatalogDto | null> {
    const c = await this.db.selectFrom('factor_catalog').selectAll().where('id', '=', id).executeTakeFirst();
    if (!c) return null;
    const factors = await this.db
      .selectFrom('factor')
      .selectAll()
      .where('catalog_id', '=', id)
      .orderBy('position', 'asc')
      .execute();
    return this.toDto(c, factors);
  }

  async findFactors(catalogId: string): Promise<FactorDto[] | null> {
    const c = await this.findById(catalogId);
    return c ? c.factors : null;
  }

  async create(data: CatalogData, isPreset = false): Promise<FactorCatalogDto> {
    try {
      const id = await this.db.transaction().execute(async (trx) => {
        const row = await trx
          .insertInto('factor_catalog')
          .values({ name: data.name, description: data.description, is_preset: isPreset })
          .returning('id')
          .executeTakeFirstOrThrow();
        await this.insertFactors(trx, row.id, data.factors);
        return row.id;
      });
      return (await this.findById(id))!;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictError(`каталог с названием «${data.name}» уже существует`);
      throw err;
    }
  }

  async replace(id: string, data: CatalogData): Promise<FactorCatalogDto | null> {
    try {
      const found = await this.db.transaction().execute(async (trx) => {
        const res = await trx
          .updateTable('factor_catalog')
          .set({ name: data.name, description: data.description, updated_at: new Date() })
          .where('id', '=', id)
          .executeTakeFirst();
        if (Number(res.numUpdatedRows) === 0) return false;
        await trx.deleteFrom('factor').where('catalog_id', '=', id).execute();
        await this.insertFactors(trx, id, data.factors);
        return true;
      });
      return found ? await this.findById(id) : null;
    } catch (err) {
      if (isUniqueViolation(err))
        throw new ConflictError(`каталог с названием «${data.name}» уже существует`);
      throw err;
    }
  }

  async delete(id: string): Promise<boolean> {
    const res = await this.db.deleteFrom('factor_catalog').where('id', '=', id).executeTakeFirst();
    return Number(res.numDeletedRows) > 0;
  }

  private async insertFactors(
    trx: Transaction<Database>,
    catalogId: string,
    factors: readonly FactorDto[],
  ): Promise<void> {
    if (factors.length === 0) return;
    await trx
      .insertInto('factor')
      .values(
        factors.map((f, position) => ({
          catalog_id: catalogId,
          code: f.code,
          name: f.name,
          far: f.far,
          frr: f.frr,
          latency_ms: f.latencyMs,
          cost: f.cost,
          has_pad: f.hasPad,
          provenance: f.provenance ?? null,
          position,
        })),
      )
      .execute();
  }

  private toDto(c: Selectable<FactorCatalogTable>, factors: Selectable<FactorTable>[]): FactorCatalogDto {
    return {
      id: c.id,
      name: c.name,
      description: c.description,
      isPreset: c.is_preset,
      factors: factors.map(toFactor),
      createdAt: c.created_at.toISOString(),
      updatedAt: c.updated_at.toISOString(),
    };
  }
}
