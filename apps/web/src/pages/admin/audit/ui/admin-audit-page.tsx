'use client';

import { useAuditEvents, useAuditVerification } from '@/entities/audit';
import { useViewer } from '@/entities/viewer';
import { API_BASE } from '@/shared/config';
import { useT } from '@/shared/i18n';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, Panel } from '@/shared/ui';

/** Журнал аудита: только добавление, цепочка SHA-256 — изменение любой записи обнаруживается проверкой. */
export function AdminAuditPage() {
  const t = useT();
  const viewer = useViewer().data;
  const allowed = viewer?.role === 'admin' || viewer?.role === 'auditor';
  const events = useAuditEvents();
  const verify = useAuditVerification();
  if (!allowed) return <Notice tone="info">{t('algo.audit.roleNotice')}</Notice>;
  const items = events.data?.pages.flat() ?? [];
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
              onClick={() => window.location.assign(`${API_BASE}/audit/export?format=${f}`)}
            >
              {t(f === 'csv' ? 'algo.audit.exportCsv' : 'algo.audit.exportJson')}
            </Button>
          ))}
        </div>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <ApiErrorNotice error={events.error ?? verify.error} />
        {v &&
          (v.ok ? (
            <Notice tone="success">{t('algo.audit.ok', { n: v.events })}</Notice>
          ) : (
            <Notice tone="error" title={t('algo.audit.brokenTitle')}>
              {t('algo.audit.broken', { n: v.brokenAt ?? 0 })}
            </Notice>
          ))}
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
                  <td className="num py-2 pr-3">{e.action}</td>
                  <td className="num py-2 pr-3 text-xs break-all">{e.target ?? '—'}</td>
                  <td className="num py-2 pr-3 text-xs break-all text-graphite">
                    {Object.keys(e.details).length ? JSON.stringify(e.details) : ''}
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
