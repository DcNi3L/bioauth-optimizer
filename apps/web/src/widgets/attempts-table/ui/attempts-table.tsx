'use client';

import { useState } from 'react';

import { type AttemptFilter, useAttempts } from '@/entities/attempt';
import { type TKey, useT } from '@/shared/i18n';
import { formatDateTime, formatMs, formatNumber, formatPercent } from '@/shared/lib';
import { ApiErrorNotice, Button, Metric, SelectField } from '@/shared/ui';

const OUTCOME_KEY = {
  accept: 'algo.attempts.accept',
  reject: 'algo.attempts.reject',
  error: 'algo.attempts.error',
  cancel: 'algo.attempts.cancel',
} as const satisfies Record<string, TKey>;
const FACTOR_KEY = {
  face: 'algo.attempts.face',
  passkey: 'algo.attempts.passkey',
  totp: 'algo.attempts.totp',
  keystroke: 'algo.attempts.keystroke',
} as const satisfies Record<string, TKey>;

/** Журнал попыток (UC-9): фильтры, сводка по факторам за выборку, постраничная подгрузка по курсору. */
export function AttemptsTable() {
  const t = useT();
  const reasonTitle = (r: string) => t(`face.reason.${r}` as TKey);
  const [filter, setFilter] = useState<AttemptFilter>({ factor: '', outcome: '' });
  const q = useAttempts(filter);
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  const stats = q.data?.pages[0]?.stats ?? [];
  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:max-w-xl">
        <SelectField
          label={t('algo.attempts.factor')}
          value={filter.factor}
          onChange={(e) => setFilter({ ...filter, factor: e.target.value as AttemptFilter['factor'] })}
        >
          <option value="">{t('algo.attempts.all')}</option>
          <option value="face">{t('algo.attempts.face')}</option>
          <option value="passkey">{t('algo.attempts.passkey')}</option>
          <option value="totp">{t('algo.attempts.totp')}</option>
          <option value="keystroke">{t('algo.attempts.keystroke')}</option>
        </SelectField>
        <SelectField
          label={t('algo.attempts.outcome')}
          value={filter.outcome}
          onChange={(e) => setFilter({ ...filter, outcome: e.target.value as AttemptFilter['outcome'] })}
        >
          <option value="">{t('algo.attempts.all')}</option>
          {Object.entries(OUTCOME_KEY).map(([v, key]) => (
            <option key={v} value={v}>
              {t(key)}
            </option>
          ))}
        </SelectField>
      </div>
      {stats.length > 0 && (
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 md:grid-cols-2">
          {stats.map((s) => (
            <div key={s.factor} className="rounded-md border border-rule p-4">
              <p className="font-medium">{t(FACTOR_KEY[s.factor])}</p>
              <div className="mt-2 grid grid-cols-3 gap-3">
                <Metric label={t('algo.attempts.attempts')} value={s.total} />
                <Metric
                  label={t('algo.attempts.rejectShare')}
                  value={formatPercent(s.total ? s.rejected / s.total : null, 1)}
                  tone="frr"
                />
                <Metric label={t('algo.attempts.p95')} value={s.p95Ms === null ? '—' : formatMs(s.p95Ms)} />
              </div>
              {Object.keys(s.byReason).length > 0 && (
                <p className="mt-2 text-xs text-graphite">
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
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-3xl text-sm">
          <thead className="text-left text-xs text-graphite">
            <tr className="border-b border-rule">
              <th className="py-2 pr-3 font-normal">{t('algo.attempts.colTime')}</th>
              <th className="py-2 pr-3 font-normal">{t('algo.attempts.colLogin')}</th>
              <th className="py-2 pr-3 font-normal">{t('algo.attempts.colFactor')}</th>
              <th className="py-2 pr-3 font-normal">{t('algo.attempts.colOutcome')}</th>
              <th className="py-2 pr-3 font-normal">{t('algo.attempts.colReason')}</th>
              <th className="py-2 pr-3 text-right font-normal">{t('algo.attempts.colScore')}</th>
              <th className="py-2 pr-3 text-right font-normal">{t('algo.attempts.colLive')}</th>
              <th className="py-2 pr-3 text-right font-normal">{t('algo.attempts.colMs')}</th>
              <th className="py-2 text-right font-normal">{t('algo.attempts.colPolicy')}</th>
            </tr>
          </thead>
          <tbody>
            {items.map((a) => (
              <tr key={a.id} className="border-b border-rule last:border-b-0">
                <td className="num py-2 pr-3 whitespace-nowrap">{formatDateTime(a.at)}</td>
                <td className="num py-2 pr-3">{a.login ?? '—'}</td>
                <td className="py-2 pr-3">{t(FACTOR_KEY[a.factor])}</td>
                <td
                  className={`py-2 pr-3 ${a.outcome === 'accept' ? 'text-optimum' : a.outcome === 'reject' ? 'text-far' : ''}`}
                >
                  {t(OUTCOME_KEY[a.outcome])}
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
        <p className="text-sm text-graphite">{t('algo.attempts.empty')}</p>
      )}
      {q.hasNextPage && (
        <div>
          <Button variant="secondary" busy={q.isFetchingNextPage} onClick={() => void q.fetchNextPage()}>
            {t('algo.history.loadMore')}
          </Button>
        </div>
      )}
    </div>
  );
}
