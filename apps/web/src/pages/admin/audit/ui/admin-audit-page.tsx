'use client';

import { Search } from 'lucide-react';
import { useState } from 'react';

import { useAuditEvents, useAuditVerification } from '@/entities/audit';
import { useViewer } from '@/entities/viewer';
import { API_BASE } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { formatDateTime } from '@/shared/lib';
import { hardNavigate } from '@/shared/lib/browser';
import { ApiErrorNotice, Badge, type BadgeTone, Button, Notice, Panel } from '@/shared/ui';

/** Цвет события по его виду: удаление и откаты — красные, вход и согласие — синие, политика — зелёная. */
function tone(action: string): BadgeTone {
  if (/deleted|revoked|rolled_back|rejected|locked|denied|enroll_failed/.test(action)) return 'far';
  if (action.startsWith('policy.') || action.startsWith('tenant.')) return 'optimum';
  if (/login|consent|oauth/.test(action)) return 'frr';
  return 'neutral';
}

/** Подробности события — парами «ключ: значение» вместо сырого JSON; длинные значения обрезаны. */
function Details({ details }: { details: Record<string, unknown> }) {
  const entries = Object.entries(details);
  if (!entries.length) return null;
  return (
    <span className="flex flex-wrap gap-1">
      {entries.map(([k, v]) => {
        const text = typeof v === 'string' ? v : JSON.stringify(v);
        return (
          <span
            key={k}
            title={text}
            className="inline-flex max-w-[22rem] items-baseline gap-1 rounded border border-rule bg-paper px-1.5 py-0.5"
          >
            <span className="text-graphite">{k}</span>
            <span className="truncate text-ink">{text}</span>
          </span>
        );
      })}
    </span>
  );
}

/** Журнал аудита: только добавление, цепочка SHA-256 — изменение любой записи обнаруживается проверкой. */
export function AdminAuditPage() {
  const t = useT();
  const viewer = useViewer().data;
  const allowed = viewer?.role === 'admin' || viewer?.role === 'auditor';
  const events = useAuditEvents();
  const verify = useAuditVerification();
  const [kind, setKind] = useState('');
  const [query, setQuery] = useState('');
  if (!allowed) return <Notice tone="info">{t('algo.audit.roleNotice')}</Notice>;
  const all = events.data?.pages.flat() ?? [];
  const kinds = [...new Set(all.map((e) => e.action.split('.')[0]!))].sort();
  const needle = query.trim().toLowerCase();
  const items = all.filter(
    (e) =>
      (!kind || e.action.startsWith(`${kind}.`)) &&
      (!needle ||
        `${e.action} ${e.target ?? ''} ${JSON.stringify(e.details)}`.toLowerCase().includes(needle)),
  );
  const v = verify.data;
  return (
    <Panel
      title={t('algo.audit.title')}
      description={t('algo.audit.desc')}
      actions={
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" busy={verify.isFetching} onClick={() => void verify.refetch()}>
            {t('algo.audit.verify')}
          </Button>
          {(['csv', 'json'] as const).map((f) => (
            <Button
              key={f}
              variant="secondary"
              onClick={() => hardNavigate(`${API_BASE}/audit/export?format=${f}`)}
            >
              {t(f === 'csv' ? 'algo.audit.exportCsv' : 'algo.audit.exportJson')}
            </Button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-4">
        <ApiErrorNotice error={events.error ?? verify.error} />
        {v &&
          (v.ok ? (
            <Notice tone="success">{t('algo.audit.ok', { n: v.events })}</Notice>
          ) : (
            <Notice tone="error" title={t('algo.audit.brokenTitle')}>
              {t('algo.audit.broken', { n: v.brokenAt ?? 0 })}
            </Notice>
          ))}
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex h-9 min-w-0 flex-1 basis-56 items-center gap-2 rounded-md border border-rule bg-sheet px-3 focus-within:border-frr">
            <Search className="size-4 shrink-0 text-graphite" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('auditUi.search')}
              aria-label={t('auditUi.search')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <div className="flex flex-wrap gap-1" role="group" aria-label={t('auditUi.kind')}>
            {['', ...kinds].map((k) => (
              <button
                key={k || 'all'}
                type="button"
                aria-pressed={kind === k}
                onClick={() => setKind(k)}
                className={`h-8 rounded-full border px-3 text-xs transition-colors ${
                  kind === k ? 'border-ink bg-ink text-sheet' : 'border-rule text-graphite hover:text-ink'
                }`}
              >
                {k || t('auditUi.all')}
              </button>
            ))}
          </div>
        </div>
        {items.length === 0 && all.length > 0 && (
          <p className="py-6 text-center text-sm text-graphite">{t('palette.empty')}</p>
        )}
        <div className="relative overflow-x-auto">
          <table className="w-full min-w-3xl text-sm">
            <thead className="text-left text-xs text-graphite">
              <tr className="border-b border-rule">
                <th className="py-2 pr-3 font-normal">{t('algo.audit.colSeq')}</th>
                <th className="py-2 pr-3 font-normal">{t('algo.audit.colTime')}</th>
                <th className="py-2 pr-3 font-normal">{t('algo.audit.colAction')}</th>
                <th className="py-2 pr-3 font-normal">{t('algo.audit.colTarget')}</th>
                <th className="py-2 pr-3 font-normal">{t('algo.audit.colDetails')}</th>
                <th className="py-2 font-normal">{t('algo.audit.colHash')}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.seq} className="border-b border-rule align-top last:border-b-0">
                  <td className="num py-2 pr-3">{e.seq}</td>
                  <td className="num py-2 pr-3 whitespace-nowrap">{formatDateTime(e.at)}</td>
                  <td className="py-2 pr-3">
                    <Badge tone={tone(e.action)}>{e.action}</Badge>
                  </td>
                  <td className="num py-2 pr-3 text-xs" title={e.target ?? undefined}>
                    {e.target ? (e.target.length > 20 ? `${e.target.slice(0, 8)}…` : e.target) : '—'}
                  </td>
                  <td className="num py-2 pr-3 text-xs">
                    <Details details={e.details} />
                  </td>
                  <td className="num py-2 text-xs text-graphite" title={e.hash}>
                    {e.hash.slice(0, 12)}…
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {events.hasNextPage && (
          <div>
            <Button
              variant="secondary"
              busy={events.isFetchingNextPage}
              onClick={() => void events.fetchNextPage()}
            >
              {t('algo.audit.older')}
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
