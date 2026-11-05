'use client';

import type { AuthPolicyDto } from '@bioauth/contracts';

import { describeStep, PolicyStatus } from '@/entities/policy';
import { PolicyActions } from '@/features/admin/manage-policy';
import { formatDateTime, formatNumber } from '@/shared/lib';

/**
 * Версии политики аутентификации, новые сверху. Принцип четырёх глаз: при нескольких администраторах утверждает не автор
 * (проверяет сервер); решения и комментарии попадают в журнал аудита.
 */
export function PolicyList({ policies, canDecide }: { policies: AuthPolicyDto[]; canDecide: boolean }) {
  if (policies.length === 0) return <p className="text-graphite text-sm">Политик нет.</p>;
  return (
    <ol className="flex flex-col gap-3">
      {policies.map((p) => (
        <li
          key={p.id}
          className={`border-rule rounded-md border p-4 ${p.status === 'active' ? 'bg-paper' : ''}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-serif text-lg">Версия {p.version}</h3>
            <PolicyStatus status={p.status} />
            <span className="text-graphite text-xs">создана {formatDateTime(p.createdAt)}</span>
          </div>
          <ol className="mt-2 list-inside list-decimal text-sm">
            {p.steps.map((s, i) => (
              <li key={i}>{describeStep(s)}</li>
            ))}
          </ol>
          <p className="text-graphite mt-1 text-xs">
            Стоимости: cFA <span className="num">{formatNumber(p.costs.cFA)}</span>, cFR{' '}
            <span className="num">{formatNumber(p.costs.cFR)}</span>
            {p.experimentId && ' · из калибровки'}
          </p>
          {p.rationale && <p className="mt-2 text-sm">{p.rationale}</p>}
          {p.decidedAt && (
            <p className="text-graphite mt-1 text-xs">
              Решение {formatDateTime(p.decidedAt)}
              {p.decisionNote ? ` — «${p.decisionNote}»` : ''}
            </p>
          )}
          {canDecide && (
            <div className="mt-3">
              <PolicyActions policy={p} />
            </div>
          )}
        </li>
      ))}
    </ol>
  );
}
