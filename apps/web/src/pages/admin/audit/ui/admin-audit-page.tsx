'use client';

import { useAuditEvents, useAuditVerification } from '@/entities/audit';
import { useViewer } from '@/entities/viewer';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, Panel } from '@/shared/ui';

/** Журнал аудита: только добавление, цепочка SHA-256 — изменение любой записи обнаруживается проверкой. */
export function AdminAuditPage() {
  const viewer = useViewer().data;
  const allowed = viewer?.role === 'admin' || viewer?.role === 'auditor';
  const events = useAuditEvents();
  const verify = useAuditVerification();
  if (!allowed) return <Notice tone="info">Журнал аудита доступен администратору и аудитору.</Notice>;
  const items = events.data?.pages.flat() ?? [];
  const v = verify.data;
  return (
    <Panel
      title="Журнал аудита"
      description="Кто, когда и что изменил: политики, согласия, шаблоны, ключи."
      actions={
        <Button variant="secondary" busy={verify.isFetching} onClick={() => void verify.refetch()}>
          Проверить целостность
        </Button>
      }
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        <ApiErrorNotice error={events.error ?? verify.error} />
        {v &&
          (v.ok ? (
            <Notice tone="success">Цепочка цела: проверено записей — {v.events}.</Notice>
          ) : (
            <Notice tone="error" title="Цепочка нарушена">
              Первая несовпадающая запись — №{v.brokenAt}. Журнал изменяли в обход приложения.
            </Notice>
          ))}
        <div className="overflow-x-auto">
          <table className="w-full min-w-[48rem] text-sm">
            <thead className="text-graphite text-left text-xs">
              <tr className="border-rule border-b">
                <th className="py-2 pr-3 font-normal">№</th>
                <th className="py-2 pr-3 font-normal">Время</th>
                <th className="py-2 pr-3 font-normal">Действие</th>
                <th className="py-2 pr-3 font-normal">Объект</th>
                <th className="py-2 pr-3 font-normal">Подробности</th>
                <th className="py-2 font-normal">Хэш</th>
              </tr>
            </thead>
            <tbody>
              {items.map((e) => (
                <tr key={e.seq} className="border-rule border-b align-top last:border-b-0">
                  <td className="num py-2 pr-3">{e.seq}</td>
                  <td className="num whitespace-nowrap py-2 pr-3">{formatDateTime(e.at)}</td>
                  <td className="num py-2 pr-3">{e.action}</td>
                  <td className="num break-all py-2 pr-3 text-xs">{e.target ?? '—'}</td>
                  <td className="num text-graphite break-all py-2 pr-3 text-xs">
                    {Object.keys(e.details).length ? JSON.stringify(e.details) : ''}
                  </td>
                  <td className="num text-graphite py-2 text-xs" title={e.hash}>
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
              Более ранние записи
            </Button>
          </div>
        )}
      </div>
    </Panel>
  );
}
