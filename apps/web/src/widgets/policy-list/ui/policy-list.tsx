'use client';

import type { AuthPolicyDto } from '@bioauth/contracts';

import { describeStep, PolicyStatus } from '@/entities/policy';
import { PolicyActions } from '@/features/admin/manage-policy';
import { useT } from '@/shared/i18n';
import { formatDateTime, formatNumber } from '@/shared/lib';

/**
 * Версии политики аутентификации, новые сверху. Принцип четырёх глаз: при нескольких администраторах утверждает не автор
 * (проверяет сервер); решения и комментарии попадают в журнал аудита.
 */
export function PolicyList({ policies, canDecide }: { policies: AuthPolicyDto[]; canDecide: boolean }) {
  const t = useT();
  if (policies.length === 0) return <p className="text-sm text-graphite">{t('algo.policies.empty')}</p>;
  return (
    <ol className="flex flex-col gap-3">
      {policies.map((p) => (
        <li
          key={p.id}
          className={`rounded-md border border-rule p-4 ${p.status === 'active' ? 'bg-paper' : ''}`}
        >
          <div className="flex flex-wrap items-center gap-3">
            <h3 className="font-serif text-lg">{t('algo.policies.version', { n: p.version })}</h3>
            <PolicyStatus status={p.status} />
            <span className="text-xs text-graphite">
              {t('algo.policies.created', { date: formatDateTime(p.createdAt) })}
            </span>
          </div>
          <ol className="mt-2 list-inside list-decimal text-sm">
            {p.steps.map((s, i) => (
              <li key={i}>{describeStep(t, s)}</li>
            ))}
          </ol>
          <p className="mt-1 text-xs text-graphite">
            {t('algo.policies.costs', { cFA: formatNumber(p.costs.cFA), cFR: formatNumber(p.costs.cFR) })}
            {p.experimentId && ` · ${t('algo.policies.fromCalibration')}`}
          </p>
          {p.rationale && <p className="mt-2 text-sm">{p.rationale}</p>}
          {p.decidedAt && (
            <p className="mt-1 text-xs text-graphite">
              {t('algo.policies.decided', { date: formatDateTime(p.decidedAt) })}
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
