import { Inject, Injectable } from '@nestjs/common';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { ConsentRepository } from '../application/consent.use-cases';

@Injectable()
export class KyselyConsentRepository implements ConsentRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async grant(userId: string, textVersion: string): Promise<boolean> {
    // Частичный уникальный индекс consent_active_idx не даст создать второе действующее согласие.
    const r = await this.db
      .insertInto('consent')
      .values({ user_id: userId, text_version: textVersion })
      .onConflict((oc) => oc.column('user_id').where('revoked_at', 'is', null).doNothing())
      .executeTakeFirst();
    return (r.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async revoke(userId: string): Promise<boolean> {
    const r = await this.db
      .updateTable('consent')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }

  async active(userId: string): Promise<{ textVersion: string } | null> {
    const r = await this.db
      .selectFrom('consent')
      .select('text_version')
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return r ? { textVersion: r.text_version } : null;
  }
}
