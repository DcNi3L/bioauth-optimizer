import { type AuthPolicyDto, costsSchema, policyStepsSchema } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { type Selectable, sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { AuthPolicyTable } from '../../../shared/database/schema';
import { InternalConsistencyError } from '../../../shared/errors';
import type { ActivePolicy, PolicyRepository, ProposePolicyData } from '../application/ports';

type Row = Selectable<AuthPolicyTable>;

const toActive = (r: Row): ActivePolicy => ({
  id: r.id,
  version: r.version,
  steps: policyStepsSchema.parse(r.steps),
  costs: costsSchema.parse(r.costs),
});

@Injectable()
export class KyselyPolicyRepository implements PolicyRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  private toDto = async (r: Row): Promise<AuthPolicyDto> => {
    const ids = [r.proposed_by, r.decided_by].filter((x): x is string => x !== null);
    const logins = ids.length
      ? new Map(
          (await this.db.selectFrom('app_user').select(['id', 'login']).where('id', 'in', ids).execute()).map(
            (u) => [u.id, u.login],
          ),
        )
      : new Map<string, string>();
    return {
      ...toActive(r),
      rationale: r.rationale,
      experimentId: r.experiment_id,
      status: r.status,
      proposedBy: r.proposed_by ? (logins.get(r.proposed_by) ?? null) : null,
      decidedBy: r.decided_by ? (logins.get(r.decided_by) ?? null) : null,
      decidedAt: r.decided_at?.toISOString() ?? null,
      decisionNote: r.decision_note,
      createdAt: r.created_at.toISOString(),
    };
  };

  async active(): Promise<ActivePolicy> {
    const r = await this.db
      .selectFrom('auth_policy')
      .selectAll()
      .where('status', '=', 'active')
      .executeTakeFirst();
    if (!r) throw new InternalConsistencyError('нет активной политики входа');
    return toActive(r);
  }

  async findById(id: string): Promise<ActivePolicy | null> {
    const r = await this.db.selectFrom('auth_policy').selectAll().where('id', '=', id).executeTakeFirst();
    return r ? toActive(r) : null;
  }

  async list(): Promise<AuthPolicyDto[]> {
    const rows = await this.db.selectFrom('auth_policy').selectAll().orderBy('version', 'desc').execute();
    return Promise.all(rows.map(this.toDto));
  }

  async get(id: string): Promise<AuthPolicyDto | null> {
    const r = await this.db.selectFrom('auth_policy').selectAll().where('id', '=', id).executeTakeFirst();
    return r ? this.toDto(r) : null;
  }

  async propose(d: ProposePolicyData): Promise<AuthPolicyDto> {
    const r = await this.db
      .insertInto('auth_policy')
      .values({
        version: sql<number>`(SELECT COALESCE(MAX(version), 0) + 1 FROM auth_policy)`,
        steps: JSON.stringify(d.steps),
        costs: JSON.stringify(d.costs),
        rationale: d.rationale,
        experiment_id: d.experimentId,
        status: 'proposed',
        proposed_by: d.proposedBy,
      })
      .returningAll()
      .executeTakeFirstOrThrow();
    return this.toDto(r);
  }

  async activate(
    id: string,
    decidedBy: string,
    note: string | null,
    from: readonly ('proposed' | 'retired')[],
  ) {
    return this.db.transaction().execute(async (trx) => {
      const target = await trx
        .selectFrom('auth_policy')
        .select('status')
        .where('id', '=', id)
        .forUpdate()
        .executeTakeFirst();
      if (!target || !from.includes(target.status as 'proposed' | 'retired')) return false;
      await trx
        .updateTable('auth_policy')
        .set({ status: 'retired' })
        .where('status', '=', 'active')
        .execute();
      await trx
        .updateTable('auth_policy')
        .set({ status: 'active', decided_by: decidedBy, decided_at: new Date(), decision_note: note })
        .where('id', '=', id)
        .execute();
      return true;
    });
  }

  async reject(id: string, decidedBy: string, note: string | null): Promise<boolean> {
    const r = await this.db
      .updateTable('auth_policy')
      .set({ status: 'rejected', decided_by: decidedBy, decided_at: new Date(), decision_note: note })
      .where('id', '=', id)
      .where('status', '=', 'proposed')
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }
}
