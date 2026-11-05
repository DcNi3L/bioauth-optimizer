'use client';

import type { ConnectedAppDto } from '@bioauth/contracts';
import { AppWindow } from 'lucide-react';
import Link from 'next/link';

import { DisconnectAppButton } from '@/features/account/disconnect-app';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { Badge, EmptyState } from '@/shared/ui';

export function ConnectedApps({ apps }: { apps: ConnectedAppDto[] }) {
  const t = useT();
  const f = useFormat();
  if (apps.length === 0) {
    return (
      <EmptyState icon={<AppWindow />} title={t('profile.apps.empty')}>
        <Link href="/oauth/demo" className="text-frr underline underline-offset-4">
          {t('profile.apps.demo')}
        </Link>
      </EmptyState>
    );
  }
  return (
    <ul className="divide-rule flex flex-col divide-y">
      {apps.map((a) => (
        <li key={a.clientId} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3.5">
          <span className="bg-frr-bg text-frr flex size-10 shrink-0 items-center justify-center rounded-xl font-serif text-lg font-semibold">
            {a.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium">
              {a.name} <span className="text-graphite num text-xs font-normal">{a.clientId}</span>
            </p>
            <p className="text-graphite mt-0.5 text-xs">
              {t('profile.apps.granted', { date: f.date(a.grantedAt) })}
              {a.lastUsedAt && ` · ${t('profile.apps.lastUsed', { date: f.relative(a.lastUsedAt) })}`}
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {a.scopes.map((s) => (
                <Badge key={s} tone="frr">
                  {s}
                </Badge>
              ))}
            </div>
          </div>
          <DisconnectAppButton clientId={a.clientId} />
        </li>
      ))}
    </ul>
  );
}
