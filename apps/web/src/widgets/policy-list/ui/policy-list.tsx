'use client';

import type { AuthPolicyDto } from '@bioauth/contracts';
import { ChevronDown } from 'lucide-react';

import { describeStep, PolicyStatus } from '@/entities/policy';
import { PolicyActions } from '@/features/admin/manage-policy';
import { useT } from '@/shared/i18n';
import { formatDateTime, formatNumber } from '@/shared/lib';

function PolicyItem({ p, canDecide }: { p: AuthPolicyDto; canDecide: boolean }) {
  const t = useT();
  return (
    <li
      className={`rounded-lg border p-4 ${
        p.status === 'active'
          ? 'border-optimum/40 bg-optimum-bg/40'
          : p.status === 'proposed'
            ? 'border-caution/40 bg-caution-bg/40'
            : 'border-rule'
      }`}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
      {canDecide && p.status !== 'active' && p.status !== 'rejected' && (
        <div className="mt-3">
          <PolicyActions policy={p} />
        </div>
      )}
    </li>
  );
}

/**
 * Версии политики аутентификации: сверху действующая и ожидающие решения, ниже — свёрнутая история. Принцип
 * четырёх глаз: при нескольких администраторах утверждает не автор (проверяет сервер); решения и комментарии
 * попадают в журнал аудита.
 */
export function PolicyList({ policies, canDecide }: { policies: AuthPolicyDto[]; canDecide: boolean }) {
  const t = useT();
  if (policies.length === 0) return <p className="text-sm text-graphite">{t('algo.policies.empty')}</p>;
  // Действующая — первой, затем ожидающие решения (новые сверху).
  const current = [
    ...policies.filter((p) => p.status === 'active'),
    ...policies.filter((p) => p.status === 'proposed'),
  ];
  const history = policies.filter((p) => p.status !== 'active' && p.status !== 'proposed');
  return (
    <div className="flex flex-col gap-4">
      <ol className="flex flex-col gap-3">
        {current.map((p) => (
          <PolicyItem key={p.id} p={p} canDecide={canDecide} />
        ))}
      </ol>
      {history.length > 0 && (
        <details className="group rounded-lg border border-rule">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium select-none hover:bg-hover/60">
            {t('policyUi.history', { n: history.length })}
            <ChevronDown
              className="size-4 text-graphite transition-transform group-open:rotate-180"
              aria-hidden
            />
          </summary>
          <ol className="flex flex-col gap-3 border-t border-rule p-3">
            {history.map((p) => (
              <PolicyItem key={p.id} p={p} canDecide={canDecide} />
            ))}
          </ol>
        </details>
      )}
    </div>
  );
}
