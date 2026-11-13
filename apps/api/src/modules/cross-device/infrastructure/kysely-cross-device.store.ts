import { Inject, Injectable } from '@nestjs/common';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { CrossDeviceRow, CrossDeviceStore } from '../application/cross-device.service';

@Injectable()
export class KyselyCrossDeviceStore implements CrossDeviceStore {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async create(r: Parameters<CrossDeviceStore['create']>[0]): Promise<string> {
    // Попутно — уборка запросов, истёкших больше суток назад.
    await this.db
      .deleteFrom('cross_device_request')
      .where('expires_at', '<', new Date(Date.now() - 86_400_000))
      .execute();
    const row = await this.db
      .insertInto('cross_device_request')
      .values({
        poll_hash: r.pollHash,
        approve_hash: r.approveHash,
        match_number: r.number,
        ip: r.ip,
        user_agent: r.userAgent,
        expires_at: r.expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return row.id;
  }

  async find(id: string): Promise<CrossDeviceRow | null> {
    const r = await this.db
      .selectFrom('cross_device_request')
      .selectAll()
      .where('id', '=', id)
      .executeTakeFirst();
    return r
      ? {
          id: r.id,
          pollHash: r.poll_hash,
          approveHash: r.approve_hash,
          number: r.match_number,
          status: r.status,
          ip: r.ip,
          userAgent: r.user_agent,
          createdAt: r.created_at,
          expiresAt: r.expires_at,
        }
      : null;
  }

  async approve(id: string, userId: string, amr: readonly string[], mfa: boolean): Promise<boolean> {
    const r = await this.db
      .updateTable('cross_device_request')
      .set({ status: 'approved', user_id: userId, amr: [...amr], mfa, decided_at: new Date() })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }

  async deny(id: string): Promise<boolean> {
    const r = await this.db
      .updateTable('cross_device_request')
      .set({ status: 'denied', decided_at: new Date() })
      .where('id', '=', id)
      .where('status', '=', 'pending')
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }

  async consume(id: string, pollHash: string) {
    const r = await this.db
      .updateTable('cross_device_request')
      .set({ status: 'consumed' })
      .where('id', '=', id)
      .where('poll_hash', '=', pollHash)
      .where('status', '=', 'approved')
      .where('expires_at', '>', new Date())
      .returning(['user_id', 'amr', 'mfa'])
      .executeTakeFirst();
    return r?.user_id ? { userId: r.user_id, amr: r.amr, mfa: r.mfa } : null;
  }
}
