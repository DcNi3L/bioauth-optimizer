'use client';

import type { LoginEventDto } from '@bioauth/contracts';
import { CheckCircle2, XCircle } from 'lucide-react';
import Link from 'next/link';

import { amrLabel, DeviceIcon, deviceLabel, methodLabel, reasonLabel } from '@/entities/account';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { Avatar, Badge, EmptyState } from '@/shared/ui';

type Event = LoginEventDto & { login?: string; userId?: string };

/**
 * История входов: на компьютере — таблица, на телефоне — карточки. Для админ-панели показывает и
 * пользователя (поле login).
 */
export function LoginHistory({ events, showUser = false }: { events: Event[]; showUser?: boolean }) {
  const t = useT();
  const f = useFormat();
  if (events.length === 0) return <EmptyState title={t('profile.history.empty')} />;
  const result = (e: Event) =>
    e.success ? (
      <span className="inline-flex items-center gap-1.5 text-sm text-optimum">
        <CheckCircle2 className="size-4" aria-hidden /> {t('profile.history.success')}
      </span>
    ) : (
      <span className="inline-flex items-center gap-1.5 text-sm text-far">
        <XCircle className="size-4" aria-hidden /> {t('profile.history.failure')}
      </span>
    );
  const method = (e: Event) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{methodLabel(t, e.method)}</span>
      {e.clientId && <code className="text-xs text-graphite">{e.clientId}</code>}
      {e.amr.map((a) => (
        <Badge key={a}>{amrLabel(t, a)}</Badge>
      ))}
    </span>
  );
  const user = (e: Event) =>
    e.userId && e.login ? (
      <Link href={`/admin/users/${e.userId}`} className="flex items-center gap-2 font-medium hover:text-frr">
        <Avatar name={e.login} size={24} />
        <span className="num">{e.login}</span>
      </Link>
    ) : null;
  return (
    <>
      <div className="hidden overflow-x-auto md:block">
        <table className="data-table">
          <thead>
            <tr>
              <th>{t('profile.history.when')}</th>
              {showUser && <th>{t('admin.logins.user')}</th>}
              <th>{t('profile.history.result')}</th>
              <th>{t('profile.history.method')}</th>
              <th>{t('profile.history.device')}</th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => (
              <tr key={e.id}>
                <td className="whitespace-nowrap">
                  <span className="block">{f.relative(e.at)}</span>
                  <span className="num text-xs text-graphite">{f.dateTime(e.at)}</span>
                </td>
                {showUser && <td>{user(e)}</td>}
                <td>
                  {result(e)}
                  {!e.success && (
                    <span className="block text-xs text-graphite">{reasonLabel(t, e.reason)}</span>
                  )}
                </td>
                <td>{method(e)}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <DeviceIcon type={e.device.type} className="size-4 shrink-0 text-graphite" />
                    <span>
                      {deviceLabel(t, e.device)}
                      {e.ip && <span className="num block text-xs text-graphite">{e.ip}</span>}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col divide-y divide-rule md:hidden">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-center justify-between gap-2">
              {result(e)}
              <span className="text-xs text-graphite">{f.relative(e.at)}</span>
            </div>
            {showUser && user(e)}
            <div className="text-sm">{method(e)}</div>
            {!e.success && e.reason && <p className="text-xs text-graphite">{reasonLabel(t, e.reason)}</p>}
            <p className="flex items-center gap-1.5 text-xs text-graphite">
              <DeviceIcon type={e.device.type} className="size-3.5" />
              {deviceLabel(t, e.device)}
              {e.ip && <span className="num">· {e.ip}</span>}
            </p>
          </li>
        ))}
      </ul>
    </>
  );
}
