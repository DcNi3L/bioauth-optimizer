import { Inject, Injectable } from '@nestjs/common';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { Avatar, AvatarStore } from '../application/ports';

@Injectable()
export class KyselyAvatarStore implements AvatarStore {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async get(userId: string): Promise<Avatar | null> {
    const r = await this.db
      .selectFrom('user_avatar')
      .selectAll()
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return r ? { mime: r.mime, data: r.data, updatedAt: r.updated_at } : null;
  }

  async put(userId: string, mime: Avatar['mime'], data: Buffer): Promise<void> {
    await this.db
      .insertInto('user_avatar')
      .values({ user_id: userId, mime, data })
      .onConflict((oc) => oc.column('user_id').doUpdateSet({ mime, data, updated_at: new Date() }))
      .execute();
  }

  async delete(userId: string): Promise<boolean> {
    const r = await this.db.deleteFrom('user_avatar').where('user_id', '=', userId).executeTakeFirst();
    return r.numDeletedRows > 0n;
  }
}
