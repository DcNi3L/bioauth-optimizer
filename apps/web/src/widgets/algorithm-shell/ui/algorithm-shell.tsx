'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { isStaff, useViewer } from '@/entities/viewer';
import { type TKey, useT } from '@/shared/i18n';
import { LinkTabs, Notice, PageHeader } from '@/shared/ui';

const TABS: readonly { href: string; label: TKey; staff?: boolean }[] = [
  { href: '/algorithm/threshold', label: 'algo.tab.threshold' },
  { href: '/algorithm/factors', label: 'algo.tab.factors' },
  { href: '/algorithm/history', label: 'algo.tab.history' },
  { href: '/algorithm/measurements', label: 'algo.tab.measurements', staff: true },
  { href: '/algorithm/calibration', label: 'algo.tab.calibration', staff: true },
  { href: '/algorithm/protocol', label: 'algo.tab.protocol', staff: true },
  { href: '/algorithm/batch', label: 'algo.tab.batch', staff: true },
  { href: '/algorithm/pad', label: 'algo.tab.pad', staff: true },
];

/**
 * «Алгоритм» — одна страница со всем расчётным: порог (формула 1), состав факторов (формулы 2–3), история,
 * а для сотрудников — измерения, калибровка, протокол, пакетный режим и испытание PAD.
 */
export function AlgorithmShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? '';
  const viewer = useViewer();
  const staff = !!viewer.data && isStaff(viewer.data.role);
  const tab = TABS.find((x) => pathname.startsWith(x.href));
  const tabs = TABS.filter((x) => !x.staff || staff).map((x) => ({
    href: x.href,
    label: t(x.label),
    badge: x.staff ? (
      <span className="bg-frr size-1.5 rounded-full" title={t('algo.staffMark')} aria-hidden />
    ) : undefined,
  }));
  const blocked = !!tab?.staff && !viewer.isPending && !staff;
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PageHeader title={t('algo.title')} description={t('algo.subtitle')} />
      <LinkTabs items={tabs} label={t('algo.title')} />
      {blocked ? (
        <Notice tone="info" title={t('algo.staffOnly')}>
          {t('algo.staffOnlyText')}{' '}
          <Link href="/login" className="underline underline-offset-4">
            {t('admin.signInStaff')}
          </Link>
        </Notice>
      ) : (
        children
      )}
    </div>
  );
}
