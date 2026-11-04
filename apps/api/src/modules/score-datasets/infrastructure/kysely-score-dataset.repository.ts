import { Inject, Injectable } from '@nestjs/common';
import { KYSELY, type Db } from '../../../shared/database/kysely';
import type {
  NewScoreDataset,
  ScoreDatasetRecord,
  ScoreDatasetRepository,
  ScoreSamples,
  ScoreSamplesReader,
} from '../application/ports';

/** Float64 little-endian независимо от платформы. */
export function encodeFloat64(values: Float64Array): Buffer {
  const buf = Buffer.allocUnsafe(values.length * 8);
  values.forEach((v, i) => buf.writeDoubleLE(v, i * 8));
  return buf;
}

export function decodeFloat64(buf: Buffer): Float64Array {
  const out = new Float64Array(buf.length / 8);
  for (let i = 0; i < out.length; i++) out[i] = buf.readDoubleLE(i * 8);
  return out;
}

@Injectable()
export class KyselyScoreDatasetRepository implements ScoreDatasetRepository, ScoreSamplesReader {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async saveIfAbsent(d: NewScoreDataset): Promise<string> {
    const inserted = await this.db
      .insertInto('score_dataset')
      .values({
        name: d.name,
        original_filename: d.originalFilename,
        genuine_count: d.genuine.length,
        impostor_count: d.impostor.length,
        genuine_scores: encodeFloat64(d.genuine),
        impostor_scores: encodeFloat64(d.impostor),
        sha256: d.sha256,
      })
      .onConflict((oc) => oc.column('sha256').doNothing())
      .returning('id')
      .executeTakeFirst();
    if (inserted) return inserted.id;
    const existing = await this.db.selectFrom('score_dataset').select('id').where('sha256', '=', d.sha256).executeTakeFirstOrThrow();
    return existing.id;
  }

  async findById(id: string): Promise<ScoreDatasetRecord | null> {
    const row = await this.db.selectFrom('score_dataset').selectAll().where('id', '=', id).executeTakeFirst();
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      originalFilename: row.original_filename,
      sha256: row.sha256,
      createdAt: row.created_at,
      genuine: decodeFloat64(row.genuine_scores),
      impostor: decodeFloat64(row.impostor_scores),
    };
  }

  async findSamples(id: string): Promise<ScoreSamples | null> {
    const row = await this.db
      .selectFrom('score_dataset')
      .select(['genuine_scores', 'impostor_scores'])
      .where('id', '=', id)
      .executeTakeFirst();
    return row ? { genuine: decodeFloat64(row.genuine_scores), impostor: decodeFloat64(row.impostor_scores) } : null;
  }
}
