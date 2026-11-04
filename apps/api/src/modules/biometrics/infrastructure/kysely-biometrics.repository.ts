import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { FaceTemplateTable } from '../../../shared/database/schema';
import type {
  AttemptInput,
  AttemptRepository,
  BiometricEraser,
  FaceTemplateRepository,
  ScoreSampleInput,
  ScoreSampleRepository,
  StoredTemplate,
} from '../application/ports';

type TemplateRow = Omit<FaceTemplateTable, 'created_at' | 'updated_at'>;

const toTemplate = (r: TemplateRow): StoredTemplate => ({
  userId: r.user_id,
  ciphertext: r.ciphertext,
  iv: r.iv,
  keyId: r.key_id,
  cancelable: r.cancelable,
  modelVersion: r.model_version,
  samples: r.samples,
});

const TEMPLATE_COLUMNS = [
  'user_id',
  'ciphertext',
  'iv',
  'key_id',
  'cancelable',
  'model_version',
  'samples',
] as const;

@Injectable()
export class KyselyFaceTemplateRepository implements FaceTemplateRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async upsert(t: StoredTemplate): Promise<{ replaced: boolean }> {
    const r = await this.db
      .insertInto('face_template')
      .values({
        user_id: t.userId,
        ciphertext: t.ciphertext,
        iv: t.iv,
        key_id: t.keyId,
        cancelable: t.cancelable,
        model_version: t.modelVersion,
        samples: t.samples,
        updated_at: new Date(),
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet((eb) => ({
          ciphertext: eb.ref('excluded.ciphertext'),
          iv: eb.ref('excluded.iv'),
          key_id: eb.ref('excluded.key_id'),
          cancelable: eb.ref('excluded.cancelable'),
          model_version: eb.ref('excluded.model_version'),
          samples: eb.ref('excluded.samples'),
          updated_at: eb.ref('excluded.updated_at'),
        })),
      )
      // xmax <> 0 — строка обновлена, а не вставлена
      .returning(sql<boolean>`xmax <> 0`.as('replaced'))
      .executeTakeFirstOrThrow();
    return { replaced: r.replaced };
  }

  async find(userId: string): Promise<StoredTemplate | null> {
    const r = await this.db
      .selectFrom('face_template')
      .select(TEMPLATE_COLUMNS)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return r ? toTemplate(r) : null;
  }

  async sampleOthers(userId: string | null, modelVersion: string, limit: number): Promise<StoredTemplate[]> {
    if (limit <= 0) return [];
    let q = this.db
      .selectFrom('face_template')
      .select(TEMPLATE_COLUMNS)
      .where('model_version', '=', modelVersion)
      .orderBy(sql`random()`)
      .limit(limit);
    if (userId) q = q.where('user_id', '<>', userId);
    return (await q.execute()).map(toTemplate);
  }

  async delete(userId: string): Promise<boolean> {
    const r = await this.db.deleteFrom('face_template').where('user_id', '=', userId).executeTakeFirst();
    return r.numDeletedRows > 0n;
  }

  async *all(): AsyncIterable<StoredTemplate> {
    let after = '00000000-0000-0000-0000-000000000000';
    for (;;) {
      const batch = await this.db
        .selectFrom('face_template')
        .select(TEMPLATE_COLUMNS)
        .where('user_id', '>', after)
        .orderBy('user_id')
        .limit(200)
        .execute();
      if (batch.length === 0) return;
      for (const r of batch) yield toTemplate(r);
      after = batch[batch.length - 1]!.user_id;
    }
  }
}

const SAMPLE_CHUNK = 5000;

@Injectable()
export class KyselyScoreSampleRepository implements ScoreSampleRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async add(samples: readonly ScoreSampleInput[]): Promise<void> {
    // Пакетный режим даёт сотни тысяч строк: вставка частями (лимит параметров PostgreSQL — 65535).
    for (let i = 0; i < samples.length; i += SAMPLE_CHUNK)
      await this.insert(samples.slice(i, i + SAMPLE_CHUNK));
  }

  private async insert(samples: readonly ScoreSampleInput[]): Promise<void> {
    await this.db
      .insertInto('score_sample')
      .values(
        samples.map((s) => ({
          attempt_id: s.attemptId ?? null,
          user_id: s.userId ?? null,
          modality: s.modality,
          kind: s.kind,
          // косинус может на 1 ulp выйти за [−1, 1]; CHECK в схеме этого не допустит
          score: Math.max(-1, Math.min(1, s.score)),
          model_version: s.modelVersion,
          source: s.source,
          attack_type: s.attackType ?? null,
        })),
      )
      .execute();
  }
}

@Injectable()
export class KyselyAttemptRepository implements AttemptRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async add(a: AttemptInput): Promise<string> {
    const r = await this.db
      .insertInto('auth_attempt')
      .values({
        user_id: a.userId,
        policy_id: a.policyId,
        session_id: a.sessionId,
        factor: a.factor,
        outcome: a.outcome,
        score: a.score === null || a.score === undefined ? null : Math.max(-1, Math.min(1, a.score)),
        liveness: a.liveness ?? null,
        challenges_ok: a.challengesOk ?? null,
        duration_ms: Math.max(0, Math.round(a.durationMs)),
        reject_reason: a.rejectReason ?? null,
        model_version: a.modelVersion ?? null,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return r.id;
  }
}

@Injectable()
export class KyselyBiometricEraser implements BiometricEraser {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  /** Одна транзакция: шаблон и passkey удаляются, оценки и попытки остаются для статистики без привязки к лицу. */
  async erase(userId: string) {
    return this.db.transaction().execute(async (trx) => {
      const face = await trx.deleteFrom('face_template').where('user_id', '=', userId).executeTakeFirst();
      const keys = await trx
        .deleteFrom('webauthn_credential')
        .where('user_id', '=', userId)
        .executeTakeFirst();
      const samples = await trx
        .updateTable('score_sample')
        .set({ user_id: null })
        .where('user_id', '=', userId)
        .executeTakeFirst();
      const attempts = await trx
        .updateTable('auth_attempt')
        .set({ user_id: null })
        .where('user_id', '=', userId)
        .executeTakeFirst();
      return {
        face: face.numDeletedRows > 0n,
        passkeys: Number(keys.numDeletedRows),
        samplesAnonymized: Number(samples.numUpdatedRows),
        attemptsAnonymized: Number(attempts.numUpdatedRows),
      };
    });
  }
}
