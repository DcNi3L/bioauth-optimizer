'use client';

import { Menu as MenuIcon, PanelLeftClose, PanelLeftOpen, Search, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';

import { useViewer } from '@/entities/viewer';
import { StepUpHost } from '@/features/step-up';
import { useT } from '@/shared/i18n';
import { useMediaQuery, useStoredValue, writeStored } from '@/shared/lib/browser';
import { SIDEBAR_KEY } from '@/shared/theme';
import { LanguageMenu, Logo, ThemeMenu } from '@/shared/ui';

import { currentItem, navFor } from '../model/nav';
import { CommandPalette } from './command-palette';
import { SidebarNav } from './sidebar';
import { ProfileMenu } from './topbar-controls';

const typing = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));

/** Свернуть или развернуть панель: атрибут на <html> меняет ширину без перерисовки, выбор запоминается. */
function setCollapsed(collapsed: boolean) {
  const v = collapsed ? 'collapsed' : 'expanded';
  document.documentElement.dataset.sidebar = v;
  writeStored(SIDEBAR_KEY, v);
}

/**
 * Оболочка консоли: боковая панель со всей навигацией (на широком экране сворачивается до иконок, на телефоне
 * выезжает), верхняя панель с меню-бургером, поиском (⌘K), языком, темой и учётной записью. Страницы входа и
 * регистрации живут в отдельной оболочке без навигации.
 */
export function AppShell({ children }: { children: ReactNode }) {
  const t = useT();
  const pathname = usePathname() ?? '';
  const me = useViewer().data;
  const groups = useMemo(() => navFor(me), [me]);
  const current = currentItem(pathname, groups);
  const desktop = useMediaQuery('(min-width: 1024px)');
  const collapsed = useStoredValue(SIDEBAR_KEY) === 'collapsed';
  const [open, setOpen] = useState(false);
  const [palette, setPalette] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLButtonElement>(null);

  // Переход на другую страницу закрывает меню: состояние сбрасывается при отрисовке, без лишнего эффекта.
  const [openedAt, setOpenedAt] = useState(pathname);
  if (openedAt !== pathname) {
    setOpenedAt(pathname);
    setOpen(false);
  }
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

  // ⌘K / Ctrl+K — поиск; «[» — свернуть или развернуть панель (не во время набора текста).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPalette((p) => !p);
      } else if (e.key === '[' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing(e.target)) {
        setCollapsed(document.documentElement.dataset.sidebar !== 'collapsed');
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, []);

  const toggleNav = () => (desktop ? setCollapsed(!collapsed) : setOpen(true));
  const navLabel = desktop ? t(collapsed ? 'nav.expand' : 'nav.collapse') : t('nav.menu');
  const NavIcon = desktop ? (collapsed ? PanelLeftOpen : PanelLeftClose) : MenuIcon;

  return (
    <div className="min-h-dvh">
      {me && me.role !== 'subject' && <StepUpHost />}
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-ink px-3 py-2 text-sm text-sheet focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skip')}
      </a>

      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-rule bg-sheet transition-[width] duration-200 lg:block rail-collapsed:w-[4.25rem]">
        <SidebarNav groups={groups} rail />
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
            className="absolute inset-0 bg-overlay"
            onClick={() => setOpen(false)}
          />
          <div className="drawer-in absolute inset-y-0 left-0 w-[min(20rem,86vw)] border-r border-rule bg-sheet shadow-2xl">
            <button
              ref={closeRef}
              type="button"
              aria-label={t('nav.closeMenu')}
              onClick={() => setOpen(false)}
              className="absolute top-4 right-3 rounded-lg p-2 text-graphite hover:bg-hover hover:text-ink"
            >
              <X className="size-5" />
            </button>
            <SidebarNav groups={groups} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <div className="transition-[padding] duration-200 lg:pl-64 lg:rail-collapsed:pl-[4.25rem]">
        <header className="sticky top-0 z-20 border-b border-rule bg-paper/85 backdrop-blur-md">
          <div className="flex h-14 items-center gap-2 px-3 sm:px-5">
            <button
              ref={menuRef}
              type="button"
              aria-label={navLabel}
              title={desktop ? `${navLabel} ( [ )` : undefined}
              aria-expanded={desktop ? !collapsed : open}
              onClick={toggleNav}
              className="-ml-1 rounded-lg p-2 text-graphite hover:bg-hover hover:text-ink"
            >
              <NavIcon className="size-5" aria-hidden />
            </button>
            <Link href="/" className="flex items-center gap-2 lg:hidden">
              <Logo className="size-7" />
              <span className="font-serif font-semibold max-[380px]:hidden">BioAuth</span>
            </Link>
            <p className="hidden min-w-0 items-center gap-2 truncate text-sm text-graphite lg:flex">
              {current?.group && (
                <>
                  <span>{t(current.group)}</span>
                  <span aria-hidden>/</span>
                </>
              )}
              {current && <span className="font-medium text-ink">{t(current.item.label)}</span>}
            </p>
            <div className="ml-auto flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPalette(true)}
                aria-label={t('nav.search')}
                aria-keyshortcuts="Control+K Meta+K"
                className="inline-flex h-9 items-center gap-2 rounded-lg px-2.5 text-sm text-graphite transition-colors hover:bg-hover hover:text-ink md:mr-1 md:w-56 md:border md:border-rule md:bg-sheet"
              >
                <Search className="size-[18px] shrink-0" aria-hidden />
                <span className="hidden flex-1 text-left md:inline">{t('nav.search')}…</span>
                <kbd className="hidden rounded border border-rule px-1.5 text-[11px] md:inline">⌘K</kbd>
              </button>
              <LanguageMenu />
              <ThemeMenu />
              <span className="mx-1 h-6 w-px bg-rule" aria-hidden />
              <ProfileMenu />
            </div>
          </div>
        </header>
        <main id="main">{children}</main>
      </div>
      <CommandPalette open={palette} onClose={() => setPalette(false)} groups={groups} me={me} />
    </div>
  );
}
