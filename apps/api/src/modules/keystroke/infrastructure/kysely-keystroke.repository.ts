import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import type { SealedSecret } from '../../../shared/crypto/secret-box';
import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { KeystrokeRepository, KeystrokeRow } from '../application/ports';

@Injectable()
export class KyselyKeystrokeRepository implements KeystrokeRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async get(userId: string): Promise<KeystrokeRow | null> {
    const r = await this.db
      .selectFrom('keystroke_template')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!r) return null;
    return {
      userId: r.user_id,
      sealed: { ciphertext: r.ciphertext, iv: r.iv, keyId: r.key_id },
      samples: r.samples,
      phrase: r.phrase,
      lockedUntil: r.locked_until,
      updatedAt: r.updated_at,
    };
  }

  async save(userId: string, s: SealedSecret, samples: number, phrase: string): Promise<void> {
    await this.db
      .insertInto('keystroke_template')
      .values({
        user_id: userId,
        ciphertext: s.ciphertext,
        iv: s.iv,
        key_id: s.keyId,
        samples,
        phrase,
        locked_until: null,
      })
      .onConflict((oc) =>
        oc.column('user_id').doUpdateSet({
          ciphertext: s.ciphertext,
          iv: s.iv,
          key_id: s.keyId,
          samples,
          phrase,
          failed_attempts: 0,
          locked_until: null,
          updated_at: sql<Date>`now()`,
        }),
      )
      .execute();
  }

  async delete(userId: string): Promise<boolean> {
    const r = await this.db.deleteFrom('keystroke_template').where('user_id', '=', userId).executeTakeFirst();
    return r.numDeletedRows > 0n;
  }

  async registerFailure(userId: string, threshold: number, lockUntil: Date) {
    const r = await this.db
      .updateTable('keystroke_template')
      .set({
        failed_attempts: sql<number>`CASE WHEN failed_attempts + 1 >= ${threshold} THEN 0 ELSE failed_attempts + 1 END`,
        locked_until: sql<Date | null>`CASE WHEN failed_attempts + 1 >= ${threshold} THEN ${lockUntil}::timestamptz ELSE locked_until END`,
      })
      .where('user_id', '=', userId)
      .returning('locked_until')
      .executeTakeFirst();
    const justLocked = !!r?.locked_until && r.locked_until.getTime() === lockUntil.getTime();
    return { lockedUntil: justLocked ? lockUntil : null };
  }

  async resetFailures(userId: string): Promise<void> {
    await this.db
      .updateTable('keystroke_template')
      .set({ failed_attempts: 0, locked_until: null })
      .where('user_id', '=', userId)
      .execute();
  }

  async sampleOthers(userId: string, phrase: string, limit: number): Promise<KeystrokeRow[]> {
    const rows = await this.db
      .selectFrom('keystroke_template')
      .selectAll()
      .where('user_id', '!=', userId)
      .where('phrase', '=', phrase)
      .orderBy(sql`random()`)
      .limit(limit)
      .execute();
    return rows.map((r) => ({
      userId: r.user_id,
      sealed: { ciphertext: r.ciphertext, iv: r.iv, keyId: r.key_id },
      samples: r.samples,
      phrase: r.phrase,
      lockedUntil: r.locked_until,
      updatedAt: r.updated_at,
    }));
  }
}
