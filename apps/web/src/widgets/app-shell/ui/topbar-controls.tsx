'use client';

import { ChevronDown, History, LogOut, ShieldCheck, UserRound } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { roleLabel, useLogout, useViewer } from '@/entities/viewer';
import { useT } from '@/shared/i18n';
import { Avatar, Menu, MenuItem, MenuSeparator } from '@/shared/ui';

export function ProfileMenu() {
  const t = useT();
  const router = useRouter();
  const viewer = useViewer();
  const me = viewer.isError ? null : viewer.data;
  const logout = useLogout();
  if (me === undefined) return <span className="size-9 animate-pulse rounded-full bg-rule" aria-hidden />;
  if (me === null) {
    return (
      <Link
        href="/login"
        className="inline-flex h-9 items-center rounded-lg bg-ink px-3.5 text-sm font-medium text-sheet hover:bg-ink-hover"
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
          <span className="hidden max-w-44 truncate text-sm font-medium md:inline">{me.displayName}</span>
          <ChevronDown className="hidden size-4 text-graphite md:inline" aria-hidden />
        </>
      }
    >
      {(close) => (
        <>
          <div className="flex items-center gap-3 px-2.5 py-2.5">
            <Avatar src={me.avatarUrl} name={me.displayName} size={40} />
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{me.displayName}</p>
              <p className="truncate text-xs text-graphite">
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
