'use client';

import { useState } from 'react';

import { type AttemptFilter, useAttempts } from '@/entities/attempt';
import { REASON_TITLES } from '@/entities/face';
import { formatDateTime, formatMs, formatNumber, formatPercent } from '@/shared/lib';
import { ApiErrorNotice, Button, Metric, SelectField } from '@/shared/ui';

const OUTCOME_LABELS = { accept: 'допуск', reject: 'отказ', error: 'ошибка', cancel: 'отмена' } as const;
const FACTOR_LABELS = { face: 'лицо', passkey: 'passkey' } as const;

const reasonTitle = (r: string) => (REASON_TITLES as Record<string, string | undefined>)[r] ?? r;

/** Журнал попыток (UC-9): фильтры, сводка по факторам за выборку, постраничная подгрузка по курсору. */
export function AttemptsTable() {
  const [filter, setFilter] = useState<AttemptFilter>({ factor: '', outcome: '' });
  const q = useAttempts(filter);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const stats = q.data?.pages[0]?.stats ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <SelectField
          label="Фактор"
          value={filter.factor}
          onChange={(e) => setFilter({ ...filter, factor: e.target.value as AttemptFilter['factor'] })}
        >
          <option value="">все</option>
          <option value="face">лицо</option>
          <option value="passkey">passkey</option>
        </SelectField>
        <SelectField
          label="Исход"
          value={filter.outcome}
          onChange={(e) => setFilter({ ...filter, outcome: e.target.value as AttemptFilter['outcome'] })}
        >
          <option value="">все</option>
          {Object.entries(OUTCOME_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
      </div>
      {stats.length > 0 && (
        <div className="grid gap-3 md:grid-cols-2">
          {stats.map((s) => (
            <div key={s.factor} className="border-rule rounded-md border p-4">
              <p className="font-medium">{FACTOR_LABELS[s.factor]}</p>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <Metric label="Попыток" value={s.total} />
                <Metric
                  label="Доля отказов"
                  value={formatPercent(s.total ? s.rejected / s.total : null, 1)}
                  tone="frr"
                />
                <Metric label="p95 времени" value={s.p95Ms === null ? '—' : formatMs(s.p95Ms)} />
              </div>
              {Object.keys(s.byReason).length > 0 && (
                <p className="text-graphite mt-2 text-xs">
                  {Object.entries(s.byReason)
                    .map(([r, n]) => `${reasonTitle(r)}: ${n}`)
                    .join(' · ')}
                </p>
              )}
            </div>
          ))}
        </div>
      )}
      <ApiErrorNotice error={q.error} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[48rem] text-sm">
          <thead className="text-graphite text-left text-xs">
            <tr className="border-rule border-b">
              <th className="py-2 pr-3 font-normal">Время</th>
              <th className="py-2 pr-3 font-normal">Логин</th>
              <th className="py-2 pr-3 font-normal">Фактор</th>
              <th className="py-2 pr-3 font-normal">Исход</th>
              <th className="py-2 pr-3 font-normal">Причина</th>
              <th className="py-2 pr-3 text-right font-normal">Сходство</th>
              <th className="py-2 pr-3 text-right font-normal">p_live</th>
              <th className="py-2 pr-3 text-right font-normal">Время, мс</th>
              <th className="py-2 text-right font-normal">Политика</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-rule border-b last:border-b-0">
                <td className="num whitespace-nowrap py-2 pr-3">{formatDateTime(a.at)}</td>
                <td className="num py-2 pr-3">{a.login ?? '—'}</td>
                <td className="py-2 pr-3">{FACTOR_LABELS[a.factor]}</td>
                <td
                  className={`py-2 pr-3 ${a.outcome === 'accept' ? 'text-optimum' : a.outcome === 'reject' ? 'text-far' : ''}`}
                >
                  {OUTCOME_LABELS[a.outcome]}
                </td>
                <td className="py-2 pr-3">{a.reason ? reasonTitle(a.reason) : ''}</td>
                <td className="num py-2 pr-3 text-right">{formatNumber(a.score, 3)}</td>
                <td className="num py-2 pr-3 text-right">{formatNumber(a.liveness, 3)}</td>
                <td className="num py-2 pr-3 text-right">{a.durationMs}</td>
                <td className="num py-2 text-right">
                  {a.policyVersion === null ? '—' : `v${a.policyVersion}`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {q.isSuccess && items.length === 0 && (
        <p className="text-graphite text-sm">Попыток с такими условиями нет.</p>
      )}
      {q.hasNextPage && (
        <div>
          <Button variant="secondary" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            Показать ещё
          </Button>
        </div>
      )}
    </div>
  );
}
