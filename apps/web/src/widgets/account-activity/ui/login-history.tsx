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
      <span className="text-optimum inline-flex items-center gap-1.5 text-sm">
        <CheckCircle2 className="size-4" aria-hidden /> {t('profile.history.success')}
      </span>
    ) : (
      <span className="text-far inline-flex items-center gap-1.5 text-sm">
        <XCircle className="size-4" aria-hidden /> {t('profile.history.failure')}
      </span>
    );
  const method = (e: Event) => (
    <span className="flex flex-wrap items-center gap-1.5">
      <span>{methodLabel(t, e.method)}</span>
      {e.clientId && (
        <span className="text-graphite text-xs">{t('profile.history.via', { app: e.clientId })}</span>
      )}
      {e.amr.map((a) => (
        <Badge key={a}>{amrLabel(t, a)}</Badge>
      ))}
    </span>
  );
  const user = (e: Event) =>
    e.userId && e.login ? (
      <Link href={`/admin/users/${e.userId}`} className="hover:text-frr flex items-center gap-2 font-medium">
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
                  <span className="text-graphite num text-xs">{f.dateTime(e.at)}</span>
                </td>
                {showUser && <td>{user(e)}</td>}
                <td>
                  {result(e)}
                  {!e.success && (
                    <span className="text-graphite block text-xs">{reasonLabel(t, e.reason)}</span>
                  )}
                </td>
                <td>{method(e)}</td>
                <td>
                  <span className="flex items-center gap-2">
                    <DeviceIcon type={e.device.type} className="text-graphite size-4 shrink-0" />
                    <span>
                      {deviceLabel(t, e.device)}
                      {e.ip && <span className="text-graphite num block text-xs">{e.ip}</span>}
                    </span>
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="divide-rule flex flex-col divide-y md:hidden">
        {events.map((e) => (
          <li key={e.id} className="flex flex-col gap-1.5 py-3">
            <div className="flex items-center justify-between gap-2">
              {result(e)}
              <span className="text-graphite text-xs">{f.relative(e.at)}</span>
            </div>
            {showUser && user(e)}
            <div className="text-sm">{method(e)}</div>
            {!e.success && e.reason && <p className="text-graphite text-xs">{reasonLabel(t, e.reason)}</p>}
            <p className="text-graphite flex items-center gap-1.5 text-xs">
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
