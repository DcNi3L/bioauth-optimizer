import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { MfaRepository, SealedSecret, TotpRow } from '../application/ports';

@Injectable()
export class KyselyMfaRepository implements MfaRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async getTotp(userId: string): Promise<TotpRow | null> {
    const r = await this.db
      .selectFrom('user_totp')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    if (!r) return null;
    return {
      userId: r.user_id,
      sealed: { ciphertext: r.secret_enc, iv: r.iv, keyId: r.key_id },
      confirmedAt: r.confirmed_at,
      lastCounter: Number(r.last_counter),
      lockedUntil: r.locked_until,
    };
  }

  async savePending(userId: string, s: SealedSecret): Promise<boolean> {
    const r = await this.db
      .insertInto('user_totp')
      .values({
        user_id: userId,
        secret_enc: s.ciphertext,
        iv: s.iv,
        key_id: s.keyId,
        confirmed_at: null,
        locked_until: null,
      })
      .onConflict((oc) =>
        oc
          .column('user_id')
          .doUpdateSet({
            secret_enc: s.ciphertext,
            iv: s.iv,
            key_id: s.keyId,
            last_counter: 0,
            failed_attempts: 0,
            locked_until: null,
          })
          .where('user_totp.confirmed_at', 'is', null),
      )
      .returning('user_id')
      .executeTakeFirst();
    return r !== undefined;
  }

  async confirmTotp(userId: string, counter: number): Promise<void> {
    await this.db
      .updateTable('user_totp')
      .set({ confirmed_at: sql<Date>`now()`, last_counter: counter, failed_attempts: 0, locked_until: null })
      .where('user_id', '=', userId)
      .execute();
  }

  async acceptCounter(userId: string, counter: number): Promise<boolean> {
    const r = await this.db
      .updateTable('user_totp')
      .set({ last_counter: counter, failed_attempts: 0, locked_until: null })
      .where('user_id', '=', userId)
      .where('last_counter', '<', String(counter))
      .returning('user_id')
      .executeTakeFirst();
    return r !== undefined;
  }

  async registerFailure(userId: string, threshold: number, lockUntil: Date) {
    const r = await this.db
      .updateTable('user_totp')
      .set({
        failed_attempts: sql<number>`CASE WHEN failed_attempts + 1 >= ${threshold} THEN 0 ELSE failed_attempts + 1 END`,
        locked_until: sql<Date | null>`CASE WHEN failed_attempts + 1 >= ${threshold} THEN ${lockUntil}::timestamptz ELSE locked_until END`,
      })
      .where('user_id', '=', userId)
      .returning(['failed_attempts', 'locked_until'])
      .executeTakeFirst();
    if (!r) return { failures: 0, lockedUntil: null };
    // failed_attempts сбрасывается при блокировке, поэтому факт блокировки определяем по новому сроку.
    const justLocked = r.locked_until !== null && r.locked_until.getTime() === lockUntil.getTime();
    return {
      failures: justLocked ? threshold : r.failed_attempts,
      lockedUntil: justLocked ? r.locked_until : null,
    };
  }

  async deleteTotp(userId: string): Promise<boolean> {
    return this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('user_recovery_code').where('user_id', '=', userId).execute();
      const r = await trx.deleteFrom('user_totp').where('user_id', '=', userId).executeTakeFirst();
      return r.numDeletedRows > 0n;
    });
  }

  async replaceRecoveryCodes(userId: string, hashes: readonly string[]): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.deleteFrom('user_recovery_code').where('user_id', '=', userId).execute();
      if (hashes.length > 0)
        await trx
          .insertInto('user_recovery_code')
          .values(hashes.map((h) => ({ user_id: userId, code_hash: h, used_at: null })))
          .execute();
    });
  }

  async consumeRecoveryCode(userId: string, hash: string): Promise<boolean> {
    const r = await this.db
      .updateTable('user_recovery_code')
      .set({ used_at: sql<Date>`now()` })
      .where('user_id', '=', userId)
      .where('code_hash', '=', hash)
      .where('used_at', 'is', null)
      .returning('id')
      .executeTakeFirst();
    return r !== undefined;
  }

  async countRecoveryCodes(userId: string): Promise<number> {
    const r = await this.db
      .selectFrom('user_recovery_code')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', userId)
      .where('used_at', 'is', null)
      .executeTakeFirstOrThrow();
    return Number(r.n);
  }
}
