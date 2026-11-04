import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import {
  type AuditEventInput,
  type AuditEventView,
  type AuditLog,
  chainHash,
  type ChainVerification,
  GENESIS_HASH,
} from '../application/audit-log';

const AUDIT_LOCK_KEY = 4_620_261_105;

@Injectable()
export class KyselyAuditLog implements AuditLog {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  /** Вставки сериализуются транзакционной advisory-блокировкой: каждая запись ссылается на предыдущую. */
  async record(event: AuditEventInput): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await sql`SELECT pg_advisory_xact_lock(${AUDIT_LOCK_KEY})`.execute(trx);
      const last = await trx
        .selectFrom('audit_event')
        .select('hash')
        .orderBy('seq', 'desc')
        .limit(1)
        .executeTakeFirst();
      const prevHash = last?.hash ?? GENESIS_HASH;
      // Время округляется до миллисекунд: столько хранит timestamptz в JS Date, иначе хэш не воспроизвести.
      const at = new Date(Math.floor(Date.now()));
      const row = {
        at,
        actorId: event.actorId,
        action: event.action,
        target: event.target ?? null,
        details: event.details ?? {},
      };
      await trx
        .insertInto('audit_event')
        .values({
          at,
          actor_id: row.actorId,
          action: row.action,
          target: row.target,
          details: JSON.stringify(row.details),
          prev_hash: prevHash,
          hash: chainHash(prevHash, row),
        })
        .execute();
    });
  }

  async list(limit: number, beforeSeq?: number): Promise<AuditEventView[]> {
    let q = this.db.selectFrom('audit_event').selectAll().orderBy('seq', 'desc').limit(limit);
    if (beforeSeq !== undefined) q = q.where('seq', '<', String(beforeSeq));
    const rows = await q.execute();
    return rows.map((r) => ({
      seq: Number(r.seq),
      at: r.at.toISOString(),
      actorId: r.actor_id,
      action: r.action,
      target: r.target,
      details: r.details as Record<string, unknown>,
      hash: r.hash,
    }));
  }

  /** Пересчитывает всю цепочку по порядку seq; первое расхождение — место подмены или удаления. */
  async verify(): Promise<ChainVerification> {
    const rows = await this.db.selectFrom('audit_event').selectAll().orderBy('seq', 'asc').execute();
    let prev = GENESIS_HASH;
    for (const r of rows) {
      const expected = chainHash(prev, {
        at: r.at,
        actorId: r.actor_id,
        action: r.action,
        target: r.target,
        details: r.details,
      });
      if (r.prev_hash !== prev || r.hash !== expected) {
        return { ok: false, events: rows.length, brokenAt: Number(r.seq) };
      }
      prev = r.hash;
    }
    return { ok: true, events: rows.length, brokenAt: null };
  }
}
