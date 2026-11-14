'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useCalibrationOverview } from '@/entities/calibration';
import { isStaff, useViewer } from '@/entities/viewer';
import { ConfirmMfaButton } from '@/features/step-up';
import { type TKey, useT } from '@/shared/i18n';
import { Notice, PageHeader, Skeleton } from '@/shared/ui';

import { DriftBanner } from './drift-banner';

const HEADERS: readonly { href: string; title: TKey; description?: TKey; exact?: boolean }[] = [
  { href: '/admin', title: 'nav.dashboard', description: 'admin.dash.subtitle', exact: true },
  { href: '/admin/users', title: 'nav.users', description: 'admin.users.subtitle', exact: true },
  { href: '/admin/logins', title: 'nav.logins', description: 'admin.logins.subtitle' },
  { href: '/admin/policies', title: 'nav.policies' },
  { href: '/admin/attempts', title: 'nav.attempts' },
  { href: '/admin/clients', title: 'nav.clients', description: 'admin.clients.subtitle' },
  { href: '/admin/audit', title: 'nav.audit' },
  { href: '/admin/branding', title: 'nav.branding', description: 'tenant.subtitle' },
];

/**
 * Админ-панель. Навигация — в боковой панели; здесь заголовок раздела, понятные сообщения вместо пустых
 * экранов (доступ проверяет сервер: роли и MFA) и баннер дрейфа калибровки.
 */
export function AdminShell({ children, actions }: { children: ReactNode; actions?: ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? '';
  const viewer = useViewer();
  const me = viewer.data;
  const staff = !!me && isStaff(me.role);
  const overview = useCalibrationOverview({ enabled: staff });
  const header = HEADERS.find((h) => (h.exact ? pathname === h.href : pathname.startsWith(h.href)));

  if (viewer.isPending) {
    return (
      <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }
  if (!staff) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Notice tone="info" title={t('admin.staffOnly')}>
          {t('admin.staffOnlyText')}{' '}
          <Link href="/login" className="underline underline-offset-4">
            {t('admin.signInStaff')}
          </Link>
        </Notice>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      {header && (
        <PageHeader
          eyebrow={t('admin.title')}
          title={t(header.title)}
          description={header.description && t(header.description)}
          actions={actions}
        />
      )}
      {!me.mfaComplete && (
        <Notice tone="caution" title={t('admin.mfaTitle')}>
          <span className="flex flex-wrap items-center gap-x-3 gap-y-2">
            <span>{t('admin.mfaText')}</span>
            <ConfirmMfaButton />
          </span>
        </Notice>
      )}
      {overview.data && <DriftBanner alerts={overview.data.drift} canAcknowledge={me.role === 'admin'} />}
      {children}
    </div>
  );
}
