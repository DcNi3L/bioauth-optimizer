import { Inject, Injectable } from '@nestjs/common';
import type { Selectable } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { ExperimentTable } from '../../../shared/database/schema';
import type {
  ExperimentPageQuery,
  ExperimentRecord,
  ExperimentRepository,
  NewExperiment,
} from '../application/experiment.repository';

function toRecord(row: Selectable<ExperimentTable>): ExperimentRecord {
  return {
    id: row.id,
    type: row.type,
    status: row.status,
    input: row.input,
    result: row.result,
    inputHash: row.input_hash,
    solver: row.solver,
    coreVersion: row.core_version,
    durationMs: row.duration_ms,
    factorCatalogId: row.factor_catalog_id,
    scoreDatasetId: row.score_dataset_id,
    createdAt: row.created_at,
  };
}

@Injectable()
export class KyselyExperimentRepository implements ExperimentRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async save(e: NewExperiment): Promise<{ id: string; createdAt: Date }> {
    const row = await this.db
      .insertInto('experiment')
      .values({
        type: e.type,
        status: e.status,
        input: JSON.stringify(e.input),
        result: JSON.stringify(e.result),
        input_hash: e.inputHash,
        solver: e.solver,
        core_version: e.coreVersion,
        duration_ms: e.durationMs,
        factor_catalog_id: e.factorCatalogId,
        score_dataset_id: e.scoreDatasetId,
      })
      .returning(['id', 'created_at'])
      .executeTakeFirstOrThrow();
    return { id: row.id, createdAt: row.created_at };
  }

  async findById(id: string): Promise<ExperimentRecord | null> {
    const row = await this.db.selectFrom('experiment').selectAll().where('id', '=', id).executeTakeFirst();
    return row ? toRecord(row) : null;
  }

  async list(q: ExperimentPageQuery): Promise<ExperimentRecord[]> {
    let query = this.db.selectFrom('experiment').selectAll();
    if (q.type) query = query.where('type', '=', q.type);
    if (q.after) {
      const { createdAt, id } = q.after;
      query = query.where((eb) =>
        eb.or([
          eb('created_at', '<', createdAt),
          eb.and([eb('created_at', '=', createdAt), eb('id', '<', id)]),
        ]),
      );
    }
    const rows = await query.orderBy('created_at', 'desc').orderBy('id', 'desc').limit(q.limit).execute();
    return rows.map(toRecord);
  }
}
