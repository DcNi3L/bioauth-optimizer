'use client';

import type { ExperimentType } from '@bioauth/contracts';
import Link from 'next/link';
import { useState } from 'react';

import { EXPERIMENT_TYPE_LABELS, SOLVER_LABELS, useExperimentList } from '@/entities/experiment';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Button, Segmented } from '@/shared/ui';

const FILTERS = [
  { value: 'ALL', label: 'Все' },
  { value: 'THRESHOLD', label: 'Порог' },
  { value: 'FACTOR_SELECTION', label: 'Состав факторов' },
  { value: 'BUDGET_SWEEP', label: 'Анализ бюджета' },
] as const;

export function ExperimentsTable() {
  const [type, setType] = useState<ExperimentType | 'ALL'>('ALL');
  const list = useExperimentList(type);
  const items = list.data?.pages.flatMap((p) => p.items) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <Segmented label="Тип эксперимента" value={type} options={FILTERS} onChange={setType} />
      <ApiErrorNotice error={list.error} />
      {list.isSuccess && items.length === 0 && (
        <p className="text-graphite text-sm">
          Экспериментов пока нет. Выполните расчёт на странице{' '}
          <Link className="text-frr underline" href="/threshold">
            «Порог»
          </Link>{' '}
          или{' '}
          <Link className="text-frr underline" href="/factors">
            «Состав факторов»
          </Link>{' '}
          — он сохранится здесь.
        </p>
      )}
      {items.length > 0 && (
        <div className="overflow-x-auto">
          <table className="data-table">
            <thead>
              <tr>
                <th>Когда</th>
                <th>Задача</th>
                <th>Результат</th>
                <th>Метод</th>
                <th className="r">Время, мс</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.id} className="hover:bg-paper">
                  <td className="num text-graphite whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                  <td className="whitespace-nowrap">{EXPERIMENT_TYPE_LABELS[e.type]}</td>
                  <td>
                    <Link
                      href={`/experiments/${e.id}`}
                      className={`hover:underline ${e.status === 'INFEASIBLE' ? 'text-far' : 'text-ink'}`}
                    >
                      {e.headline}
                    </Link>
                  </td>
                  <td className="text-graphite">{e.solver ? (SOLVER_LABELS[e.solver] ?? e.solver) : '—'}</td>
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
            Показать ещё
          </Button>
        </div>
      )}
    </div>
  );
}
