import type { AuthPolicyDto, CostsDto, PolicyStep } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { USER_REPOSITORY, type UserRepository } from '../../identity/application/ports';
import { POLICY_REPOSITORY, type PolicyRepository } from './ports';

/**
 * Версии политик входа (docs/10 §10.7): предложение → утверждение администратором → активна.
 * Активация атомарна (одна активная политика — инвариант схемы), каждое решение — в журнал аудита.
 */
@Injectable()
export class PolicyService {
  constructor(
    @Inject(POLICY_REPOSITORY) private readonly repo: PolicyRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  list(): Promise<AuthPolicyDto[]> {
    return this.repo.list();
  }

  async get(id: string): Promise<AuthPolicyDto> {
    const p = await this.repo.get(id);
    if (!p) throw new NotFoundError('политика не найдена');
    return p;
  }

  async propose(
    by: AuthUser | null,
    data: { steps: PolicyStep[]; costs: CostsDto; rationale: string | null; experimentId: string | null },
  ): Promise<AuthPolicyDto> {
    const p = await this.repo.propose({ ...data, proposedBy: by?.id ?? null });
    await this.audit.record({
      actorId: by?.id ?? null,
      action: 'policy.proposed',
      target: p.id,
      details: { version: p.version, steps: p.steps, costs: p.costs, experimentId: p.experimentId },
    });
    return p;
  }

  /** Принцип четырёх глаз: если администраторов несколько, автор предложения не утверждает его сам. */
  async approve(by: AuthUser, id: string, note: string | null): Promise<AuthPolicyDto> {
    const p = await this.get(id);
    if (p.status !== 'proposed')
      throw new ConflictError(`политика в статусе «${p.status}» не может быть утверждена`);
    if (p.proposedBy === by.login && (await this.users.countByRole('admin')) > 1) {
      throw new ForbiddenError('предложение утверждает другой администратор');
    }
    if (!(await this.repo.activate(id, by.id, note, ['proposed'])))
      throw new ConflictError('политика уже изменена');
    await this.audit.record({
      actorId: by.id,
      action: 'policy.approved',
      target: id,
      details: { version: p.version, note },
    });
    return this.get(id);
  }

  async reject(by: AuthUser, id: string, note: string | null): Promise<AuthPolicyDto> {
    const p = await this.get(id);
    if (!(await this.repo.reject(id, by.id, note))) {
      throw new ConflictError(`политика в статусе «${p.status}» не может быть отклонена`);
    }
    await this.audit.record({
      actorId: by.id,
      action: 'policy.rejected',
      target: id,
      details: { version: p.version, note },
    });
    return this.get(id);
  }

  /** Откат: повторная активация ранее действовавшей версии. */
  async rollback(by: AuthUser, id: string, note: string | null): Promise<AuthPolicyDto> {
    const p = await this.get(id);
    if (!(await this.repo.activate(id, by.id, note, ['retired']))) {
      throw new ConflictError('откатиться можно только к ранее действовавшей версии');
    }
    await this.audit.record({
      actorId: by.id,
      action: 'policy.rolled_back',
      target: id,
      details: { version: p.version, note },
    });
    return this.get(id);
  }
}
