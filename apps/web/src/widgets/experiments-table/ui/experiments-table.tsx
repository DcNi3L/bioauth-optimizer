'use client';

import type { ExperimentType } from '@bioauth/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { useExperimentList } from '@/entities/experiment';
import { type TKey, useT } from '@/shared/i18n';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Button, Segmented } from '@/shared/ui';

const SOLVER_KEY_MAP: Partial<Record<string, TKey>> = {
  'gaussian-analytic': 'algo.history.solverGaussian',
  'empirical-sweep': 'algo.history.solverEmpirical',
  exhaustive: 'algo.history.solverExhaustive',
  ilp: 'algo.history.solverIlp',
};

export function ExperimentsTable() {
  const t = useT();

  const FILTERS = [
    { value: 'ALL', label: t('algo.history.filterAll') },
    { value: 'THRESHOLD', label: t('algo.history.filterThreshold') },
    { value: 'FACTOR_SELECTION', label: t('algo.history.filterFactors') },
    { value: 'BUDGET_SWEEP', label: t('algo.history.filterBudget') },
  ] as const;

  const TYPE_LABELS: Record<ExperimentType, TKey> = {
    THRESHOLD: 'algo.history.typeThreshold',
    FACTOR_SELECTION: 'algo.history.typeFactors',
    BUDGET_SWEEP: 'algo.history.typeBudget',
  };

  const [type, setType] = useState<ExperimentType | 'ALL'>('ALL');
  const list = useExperimentList(type);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Segmented label={t('algo.history.filterLabel')} value={type} options={FILTERS} onChange={setType} />
      <ApiErrorNotice error={list.error} />
      {list.isSuccess && items.length === 0 && (
        <p className="text-sm text-graphite">{t('algo.history.empty')}</p>
      )}
      {items.length > 0 && (
        <div className="relative overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>{t('algo.history.colWhen')}</th>
                <th>{t('algo.history.colTask')}</th>
                <th>{t('algo.history.colResult')}</th>
                <th>{t('algo.history.colMethod')}</th>
                <th className="r">{t('algo.history.colDuration')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="hover:bg-paper">
                  <td className="num whitespace-nowrap text-graphite">{formatDateTime(e.createdAt)}</td>
                  <td className="whitespace-nowrap">{t(TYPE_LABELS[e.type])}</td>
                  <td>
                    <Link
                      href={`/algorithm/history/${e.id}`}
                      className={`hover:underline ${e.status === 'INFEASIBLE' ? 'text-far' : 'text-ink'}`}
                    >
                      {e.headline}
                    </Link>
                  </td>
                  <td className="text-graphite">
                    {e.solver
                      ? SOLVER_KEY_MAP[e.solver] !== undefined
                        ? t(SOLVER_KEY_MAP[e.solver]!)
                        : e.solver
                      : '—'}
                  </td>
                  <td className="num r">{e.durationMs}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {list.hasNextPage && (
        <div>
          <Button
            variant="secondary"
            busy={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            {t('algo.history.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
