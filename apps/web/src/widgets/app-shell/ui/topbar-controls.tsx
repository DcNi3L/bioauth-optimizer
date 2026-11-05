'use client';

import {
  ChevronDown,
  History,
  Languages,
  LogOut,
  Monitor,
  Moon,
  ShieldCheck,
  Sun,
  UserRound,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { roleLabel, useLogout, useViewer } from '@/entities/viewer';
import { LOCALES, useI18n, useT } from '@/shared/i18n';
import { type ThemeChoice, useTheme } from '@/shared/theme';
import { Avatar, Menu, MenuItem, MenuSeparator } from '@/shared/ui';

const iconBtn =
  'text-graphite hover:text-ink hover:bg-hover inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors';

export function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
  const current = LOCALES.find((l) => l.code === locale)!;
  return (
    <Menu
      label={t('topbar.language')}
      triggerClassName={iconBtn}
      trigger={
        <>
          <Languages className="size-[18px]" aria-hidden />
          <span className="font-medium">{current.short}</span>
        </>
      }
    >
      {(close) =>
        LOCALES.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === locale}
            onSelect={() => {
              setLocale(l.code);
              close();
            }}
            icon={<span className="text-[11px] font-semibold">{l.short}</span>}
          >
            {l.label}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeMenu() {
  const t = useT();
  const { choice, resolved, setChoice } = useTheme();
  const Current = resolved === 'dark' ? Moon : Sun;
  return (
    <Menu
      label={t('topbar.theme')}
      triggerClassName={iconBtn}
      trigger={<Current className="size-[18px]" aria-hidden />}
    >
      {(close) =>
        (['light', 'dark', 'system'] as ThemeChoice[]).map((c) => {
          const Icon = THEME_ICONS[c];
          return (
            <MenuItem
              key={c}
              selected={choice === c}
              icon={<Icon />}
              onSelect={() => {
                setChoice(c);
                close();
              }}
            >
              {t(`topbar.${c}`)}
            </MenuItem>
          );
        })
      }
    </Menu>
  );
}

export function ProfileMenu() {
  const t = useT();
  const router = useRouter();
  const viewer = useViewer();
  const me = viewer.isError ? null : viewer.data;
  const logout = useLogout();
  if (me === undefined) return <span className="bg-rule size-9 animate-pulse rounded-full" aria-hidden />;
  if (me === null) {
    return (
      <Link
        href="/login"
        className="bg-ink text-sheet hover:bg-ink-hover inline-flex h-9 items-center rounded-lg px-3.5 text-sm font-medium"
      >
        {t('topbar.signIn')}
      </Link>
    );
  }
  return (
    <Menu
      label={t('topbar.accountMenu')}
      triggerClassName="hover:bg-hover flex items-center gap-2 rounded-full py-1 pr-2 pl-1 transition-colors"
      trigger={
        <>
          <Avatar src={me.avatarUrl} name={me.displayName} size={30} />
          <span className="hidden max-w-36 truncate text-sm font-medium md:inline">{me.displayName}</span>
          <ChevronDown className="text-graphite hidden size-4 md:inline" aria-hidden />
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar src={me.avatarUrl} name={me.displayName} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{me.displayName}</p>
              <p className="text-graphite truncate text-xs">
                <span className="num">{me.login}</span> · {roleLabel(t, me.role)}
              </p>
            </div>
          </div>
          <MenuSeparator />
          {(
            [
              ['/profile', 'topbar.profile', UserRound],
              ['/profile/security', 'topbar.security', ShieldCheck],
              ['/profile/activity', 'topbar.activity', History],
            ] as const
          ).map(([href, key, Icon]) => (
            <MenuItem
              key={href}
              icon={<Icon />}
              onSelect={() => {
                close();
                router.push(href);
              }}
            >
              {t(key)}
            </MenuItem>
          ))}
          <MenuSeparator />
          <MenuItem
            icon={<LogOut />}
            onSelect={() => {
              close();
              logout.mutate(undefined, { onSuccess: () => router.push('/login') });
            }}
          >
            {t('topbar.logout')}
          </MenuItem>
        </>
      )}
    </Menu>
  );
}
