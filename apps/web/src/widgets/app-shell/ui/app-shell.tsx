'use client';

import { Menu as MenuIcon, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useViewer } from '@/entities/viewer';
import { StepUpHost } from '@/features/step-up';
import { useT } from '@/shared/i18n';

import { currentItem, navFor } from '../model/nav';
import { Logo } from './logo';
import { SidebarNav } from './sidebar';
import { LanguageMenu, ProfileMenu, ThemeMenu } from './topbar-controls';

/**
 * Оболочка приложения: боковая панель со всей навигацией (на телефоне — выезжающая), верхняя панель
 * только с языком, темой и учётной записью.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? '';
  const me = useViewer().data;
  const groups = useMemo(() => navFor(me), [me]);
  const current = currentItem(pathname, groups);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  useEffect(() => setOpen(false), [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    // Фокус — в панель, после закрытия — обратно на кнопку меню.
    closeRef.current?.focus();
    const trigger = menuRef.current;
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="min-h-dvh">
      {me && me.role !== 'subject' && <StepUpHost />}
      <a
        href="#main"
        className="bg-ink text-sheet sr-only z-[60] rounded-md px-3 py-2 text-sm focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        {t('nav.skip')}
      </a>

      <aside className="border-rule bg-sheet fixed inset-y-0 left-0 z-30 hidden w-64 border-r lg:block">
        <SidebarNav groups={groups} />
      </aside>

      {open && (
        <div
          className="fixed inset-0 z-50 lg:hidden"
          role="dialog"
          aria-modal="true"
          aria-label={t('nav.sections')}
        >
          <button
            type="button"
            aria-label={t('nav.closeMenu')}
            className="bg-overlay absolute inset-0"
            onClick={() => setOpen(false)}
          />
          <div className="bg-sheet border-rule drawer-in absolute inset-y-0 left-0 w-[min(20rem,86vw)] border-r shadow-2xl">
            <button
              ref={closeRef}
              type="button"
              aria-label={t('nav.closeMenu')}
              onClick={() => setOpen(false)}
              className="text-graphite hover:text-ink hover:bg-hover absolute right-3 top-4 rounded-lg p-2"
            >
              <X className="size-5" />
            </button>
            <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="lg:pl-64">
        <header className="border-rule bg-paper/85 sticky top-0 z-20 border-b backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <button
              ref={menuRef}
              type="button"
              aria-label={t('nav.menu')}
              aria-expanded={open}
              onClick={() => setOpen(true)}
              className="text-graphite hover:text-ink hover:bg-hover -ml-1 rounded-lg p-2 lg:hidden"
            >
              <MenuIcon className="size-5" />
            </button>
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <Logo className="size-7" />
              <span className="font-serif font-semibold max-[380px]:hidden">BioAuth</span>
            </Link>
            <p className="text-graphite hidden min-w-0 items-center gap-2 truncate text-sm lg:flex">
              {current?.group && (
                <>
                  <span>{t(current.group)}</span>
                  <span aria-hidden>/</span>
                </>
              )}
              {current && <span className="text-ink font-medium">{t(current.item.label)}</span>}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <LanguageMenu />
              <ThemeMenu />
              <span className="bg-rule mx-1 h-6 w-px" aria-hidden />
              <ProfileMenu />
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
    </div>
  );
}
