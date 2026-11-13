'use client';

import type { UserSessionDto } from '@bioauth/contracts';

import { amrLabel, DeviceIcon, deviceLabel } from '@/entities/account';
import { RevokeSessionButton } from '@/features/account/manage-sessions';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { Badge } from '@/shared/ui';

/** Сессии: устройство, адрес, способы проверки; текущая — первой и без кнопки завершения. */
export function SessionList({
  sessions,
  revocable = true,
}: {
  sessions: UserSessionDto[];
  revocable?: boolean;
}) {
  const t = useT();
  const f = useFormat();
  const sorted = [...sessions].sort((a, b) => Number(b.current) - Number(a.current));
  return (
    <ul className="flex flex-col divide-y divide-rule">
      {sorted.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
          <span
            className={`flex size-10 shrink-0 items-center justify-center rounded-xl ${
              s.current ? 'bg-optimum-bg text-optimum' : 'bg-paper text-graphite'
            }`}
          >
            <DeviceIcon type={s.device.type} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
              {deviceLabel(t, s.device)}
              {s.current && (
                <Badge tone="optimum" dot>
                  {t('profile.sessions.thisDevice')}
                </Badge>
              )}
              {s.amr.map((a) => (
                <Badge key={a}>{amrLabel(t, a)}</Badge>
              ))}
            </p>
            <p className="mt-0.5 text-xs text-graphite">
              {s.ip && <span className="num">{s.ip} · </span>}
              {t('profile.sessions.lastActive', { time: f.relative(s.lastSeenAt) })} ·{' '}
              {t('profile.sessions.started', { date: f.dateTime(s.createdAt) })} ·{' '}
              {t('profile.sessions.expires', { date: f.dateTime(s.expiresAt) })}
            </p>
          </div>
          {revocable && !s.current && <RevokeSessionButton id={s.id} />}
        </li>
      ))}
    </ul>
  );
}
