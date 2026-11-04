'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

import { useCalibrationOverview } from '@/entities/calibration';
import { isStaff, ROLE_LABELS, useViewer } from '@/entities/viewer';
import { Notice } from '@/shared/ui';

import { DriftBanner } from './drift-banner';

const TABS = [
  { href: '/admin', label: 'Обзор' },
  { href: '/admin/calibration', label: 'Калибровка' },
  { href: '/admin/policies', label: 'Политики' },
  { href: '/admin/attempts', label: 'Попытки' },
  { href: '/admin/pad-test', label: 'Испытание PAD' },
  { href: '/admin/audit', label: 'Аудит' },
] as const;

/**
 * Рабочее место сотрудника (UC-6…UC-9). Доступ проверяет сервер (роли, MFA); здесь — понятные сообщения
 * вместо пустых экранов и баннер дрейфа на всех вкладках.
 */
export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? '';
  const viewer = useViewer();
  const me = viewer.data;
  const staff = !!me && isStaff(me.role);
  const overview = useCalibrationOverview({ enabled: staff });

  if (viewer.isPending) return <p className="text-graphite px-6 py-10">Загрузка…</p>;
  if (!staff) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Notice tone="info" title="Раздел для сотрудников">
          Администрирование доступно администратору безопасности, исследователю и аудитору.{' '}
          <Link href="/login" className="underline underline-offset-4">
            Войти как сотрудник
          </Link>
        </Notice>
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6">
      <header className="flex flex-col gap-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h1 className="text-2xl">Администрирование</h1>
          <p className="text-graphite text-sm">
            <span className="num">{me.login}</span> · {ROLE_LABELS[me.role]}
          </p>
        </div>
        <nav
          aria-label="Разделы администрирования"
          className="border-rule -mx-1 flex gap-1 overflow-x-auto border-b"
        >
          {TABS.map((t) => {
            const active = t.href === '/admin' ? pathname === t.href : pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px shrink-0 border-b-2 px-3 py-2 text-sm ${active ? 'border-ink text-ink font-medium' : 'text-graphite hover:text-ink border-transparent'}`}
              >
                {t.label}
              </Link>
            );
          })}
        </nav>
      </header>
      {!me.mfaComplete && (
        <Notice tone="caution" title="Вход выполнен одним фактором">
          Изменение политик требует двухфакторного входа.{' '}
          <Link href="/profile" className="underline underline-offset-4">
            Подтвердите вход passkey в профиле
          </Link>
          .
        </Notice>
      )}
      {overview.data && <DriftBanner alerts={overview.data.drift} canAcknowledge={me.role === 'admin'} />}
      {children}
    </div>
  );
}
