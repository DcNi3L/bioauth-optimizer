'use client';

import type { MeDto } from '@bioauth/contracts';
import { CornerDownLeft, LogOut, Monitor, Moon, Search, Sun, UserRound } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { type ReactNode, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from 'react';

import { useAdminUsers } from '@/entities/admin-user';
import { useLogout } from '@/entities/viewer';
import { useT } from '@/shared/i18n';
import { hardNavigate } from '@/shared/lib/browser';
import { useTheme } from '@/shared/theme';
import { Avatar } from '@/shared/ui';

import type { NavGroup } from '../model/nav';

interface Command {
  id: string;
  label: string;
  hint?: string;
  section: string;
  icon: ReactNode;
  keywords?: string;
  run: () => void;
}

/** Совпадение без учёта регистра и «ё»: «пол» находит «Пользователи» и «Политики». */
const norm = (s: string) => s.toLowerCase().replace(/ё/g, 'е');

function UserResults({
  q,
  enabled,
  onPick,
  render,
}: {
  q: string;
  enabled: boolean;
  onPick: (id: string) => void;
  render: (cmds: Command[]) => ReactNode;
}) {
  const t = useT();
  const users = useAdminUsers({ q, role: '', status: '', offset: 0, limit: 6 }, enabled);
  const cmds: Command[] = (enabled ? (users.data?.items ?? []) : []).map((u) => ({
    id: `user:${u.id}`,
    label: u.displayName,
    hint: `@${u.login}`,
    section: t('palette.users'),
    icon: <Avatar src={u.avatarUrl} name={u.displayName} size={20} />,
    run: () => onPick(u.id),
  }));
  return render(cmds);
}

/**
 * Палитра команд (⌘K / Ctrl+K): переход к любому разделу, поиск пользователей (для сотрудников), смена темы и
 * выход — с клавиатуры, как поиск в панели Auth0.
 */
export function CommandPalette({
  open,
  onClose,
  groups,
  me,
}: {
  open: boolean;
  onClose: () => void;
  groups: NavGroup[];
  me: MeDto | null | undefined;
}) {
  const t = useT();
  const router = useRouter();
  const { setChoice } = useTheme();
  const logout = useLogout();
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const listId = useId();
  const [query, setQuery] = useState('');
  const [cursor, setCursor] = useState(0);
  const deferred = useDeferredValue(query.trim());
  const canSearchUsers = !!me && (me.role === 'admin' || me.role === 'auditor');

  useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      input.current?.focus();
    } else if (!open && d.open) d.close();
  }, [open]);

  const close = () => {
    setQuery('');
    setCursor(0);
    onClose();
  };
  const go = (href: string, external = false) => {
    close();
    if (external) window.open(href, '_blank', 'noopener');
    else router.push(href);
  };

  const base = useMemo<Command[]>(() => {
    const nav = groups.flatMap((g) =>
      g.items.map((item) => {
        const Icon = item.icon;
        return {
          id: `nav:${item.href}`,
          label: t(item.label),
          hint: g.title ? t(g.title) : undefined,
          section: t('palette.pages'),
          icon: <Icon className="size-4" aria-hidden />,
          keywords: item.href,
          run: () => go(item.href, item.external),
        };
      }),
    );
    const actions: Command[] = [
      {
        id: 'theme:light',
        label: t('palette.themeLight'),
        icon: <Sun className="size-4" />,
        run: () => setChoice('light'),
      },
      {
        id: 'theme:dark',
        label: t('palette.themeDark'),
        icon: <Moon className="size-4" />,
        run: () => setChoice('dark'),
      },
      {
        id: 'theme:system',
        label: t('palette.themeSystem'),
        icon: <Monitor className="size-4" />,
        run: () => setChoice('system'),
      },
    ].map((a) => ({
      ...a,
      section: t('palette.actions'),
      run: () => {
        a.run();
        close();
      },
    }));
    if (me) {
      actions.push({
        id: 'logout',
        label: t('topbar.logout'),
        section: t('palette.actions'),
        icon: <LogOut className="size-4" />,
        run: () => {
          close();
          logout.mutate(undefined, { onSuccess: () => hardNavigate('/login') });
        },
      });
    } else {
      actions.push({
        id: 'login',
        label: t('topbar.signIn'),
        section: t('palette.actions'),
        icon: <UserRound className="size-4" />,
        run: () => go('/login'),
      });
    }
    return [...nav, ...actions];
    // go/close/logout стабильны по смыслу; пересчёт — при смене языка, меню и пользователя.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, me, t]);

  const filtered = deferred
    ? base.filter((c) => norm(`${c.label} ${c.hint ?? ''} ${c.keywords ?? ''}`).includes(norm(deferred)))
    : base;

  const renderList = (users: Command[]) => {
    const all = [...filtered, ...users];
    const active = Math.min(cursor, Math.max(0, all.length - 1));
    const onKeyDown = (e: React.KeyboardEvent) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const n = all.length || 1;
        setCursor((active + (e.key === 'ArrowDown' ? 1 : n - 1)) % n);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        all[active]?.run();
      }
    };
    let lastSection = '';
    return (
      <>
        <div className="flex items-center gap-3 border-b border-rule px-4">
          <Search className="size-4 shrink-0 text-graphite" aria-hidden />
          <input
            ref={input}
            role="combobox"
            aria-expanded="true"
            aria-controls={listId}
            aria-activedescendant={all[active] ? `${listId}-${active}` : undefined}
            aria-label={t('nav.searchHint')}
            placeholder={canSearchUsers ? t('nav.searchHint') : t('palette.placeholder')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setCursor(0);
            }}
            onKeyDown={onKeyDown}
            className="h-12 w-full bg-transparent text-[15px] outline-none placeholder:text-graphite"
          />
          <kbd className="hidden rounded border border-rule px-1.5 py-0.5 text-[11px] text-graphite sm:block">
            Esc
          </kbd>
        </div>
        <ul
          id={listId}
          role="listbox"
          aria-label={t('nav.search')}
          className="max-h-[min(60vh,26rem)] overflow-y-auto p-2"
        >
          {all.length === 0 && (
            <li className="px-3 py-6 text-center text-sm text-graphite">{t('palette.empty')}</li>
          )}
          {all.map((c, i) => {
            const header = c.section !== lastSection;
            lastSection = c.section;
            return (
              <li key={c.id} role="presentation">
                {header && (
                  <p className="px-3 pt-2 pb-1 text-[11px] font-semibold tracking-wider text-graphite uppercase">
                    {c.section}
                  </p>
                )}
                {/* Клавиатура — у поля ввода (combobox с aria-activedescendant); щелчок — для мыши. */}
                {/* eslint-disable-next-line jsx-a11y/click-events-have-key-events */}
                <div
                  id={`${listId}-${i}`}
                  role="option"
                  tabIndex={-1}
                  aria-selected={i === active}
                  onMouseMove={() => i !== active && setCursor(i)}
                  onClick={() => c.run()}
                  className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                    i === active ? 'bg-hover text-ink' : 'text-ink/90'
                  }`}
                >
                  <span className="flex size-5 shrink-0 items-center justify-center text-graphite">
                    {c.icon}
                  </span>
                  <span className="min-w-0 flex-1 truncate">{c.label}</span>
                  {c.hint && <span className="truncate text-xs text-graphite">{c.hint}</span>}
                  {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-graphite" aria-hidden />}
                </div>
              </li>
            );
          })}
        </ul>
        <p className="flex items-center gap-4 border-t border-rule px-4 py-2 text-[11px] text-graphite">
          <span>
            <kbd className="font-sans">↑↓</kbd> {t('palette.navigate')}
          </span>
          <span>
            <kbd className="font-sans">↵</kbd> {t('palette.open')}
          </span>
        </p>
      </>
    );
  };

  return (
    // Щелчок по подложке закрывает окно; с клавиатуры — Esc (поведение <dialog>).
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={dialog}
      aria-label={t('nav.search')}
      onClose={close}
      onClick={(e) => e.target === dialog.current && close()}
      className="m-auto mt-[12vh] w-[min(36rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-rule bg-sheet p-0 text-ink shadow-2xl backdrop:bg-overlay"
    >
      {open && (
        <UserResults
          q={deferred}
          enabled={canSearchUsers && deferred.length >= 2}
          onPick={(id) => go(`/admin/users/${id}`)}
          render={renderList}
        />
      )}
    </dialog>
  );
}
