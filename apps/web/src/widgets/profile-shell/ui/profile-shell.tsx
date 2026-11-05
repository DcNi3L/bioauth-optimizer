'use client';

import { CalendarDays, Camera, Clock3, LogOut, Mail } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { type ReactNode, useState } from 'react';

import { useConnectedApps, useLoginHistory, useSessions } from '@/entities/account';
import { roleLabel, useLogout, useViewer } from '@/entities/viewer';
import { AvatarDialog } from '@/features/account/change-avatar';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { Avatar, Badge, Button, LinkTabs, Notice, Skeleton } from '@/shared/ui';

function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="bg-sheet flex flex-col gap-0.5 px-4 py-3">
      <span className="text-graphite text-xs">{label}</span>
      <span className="num font-serif text-xl font-semibold">{value}</span>
      {sub && <span className="text-graphite text-[11px]">{sub}</span>}
    </div>
  );
}

/** Профиль: карточка с фото и показателями, вкладки «Обзор / Безопасность / Активность / Приложения». */
export function ProfileShell({ children }: { children: ReactNode }) {
  const t = useT();
  const f = useFormat();
  const router = useRouter();
  const viewer = useViewer();
  const me = viewer.data;
  const logout = useLogout();
  const [avatarOpen, setAvatarOpen] = useState(false);
  const sessions = useSessions(!!me);
  const history = useLoginHistory(100, !!me);
  const apps = useConnectedApps(!!me);

  if (viewer.isPending) {
    return (
      <div className="mx-auto flex max-w-5xl flex-col gap-4 px-4 py-8 sm:px-6">
        <Skeleton className="h-44 w-full rounded-2xl" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }
  if (!me) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Notice tone="info" title={t('profile.guestTitle')}>
          {t('profile.guestText')}{' '}
          <Link href="/login" className="underline underline-offset-4">
            {t('nav.login')}
          </Link>{' '}
          ·{' '}
          <Link href="/enroll" className="underline underline-offset-4">
            {t('nav.enroll')}
          </Link>
        </Notice>
      </div>
    );
  }
  const ok = history.data?.filter((e) => e.success).length;
  const failed = history.data?.filter((e) => !e.success).length ?? 0;
  const factors = [me.face ? t('profile.face') : null, me.passkeys > 0 ? 'passkey' : null].filter(Boolean);
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <section className="border-rule bg-sheet overflow-hidden rounded-2xl border">
        <div className="profile-cover h-24 sm:h-28" aria-hidden />
        <div className="flex flex-col gap-4 px-5 pb-5 sm:flex-row sm:items-start sm:gap-5">
          <button
            type="button"
            onClick={() => setAvatarOpen(true)}
            className="ring-sheet group relative -mt-12 w-fit rounded-full ring-4 sm:-mt-14"
            aria-label={t('profile.changeAvatar')}
          >
            <Avatar src={me.avatarUrl} name={me.displayName} size={104} />
            <span className="bg-ink/55 absolute inset-0 flex items-center justify-center rounded-full text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera className="size-6" />
            </span>
            <span className="bg-ink text-sheet ring-sheet absolute bottom-1 right-1 rounded-full p-1.5 ring-2 sm:hidden">
              <Camera className="size-3.5" />
            </span>
          </button>
          <div className="min-w-0 flex-1 sm:pt-3">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="truncate text-2xl sm:text-3xl">{me.displayName}</h1>
              <Badge tone={me.role === 'subject' ? 'neutral' : 'frr'}>{roleLabel(t, me.role)}</Badge>
            </div>
            <p className="text-graphite mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
              <span className="num">@{me.login}</span>
              <span className="inline-flex items-center gap-1.5">
                <Mail className="size-3.5" aria-hidden />
                {me.email ?? t('profile.noEmail')}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <CalendarDays className="size-3.5" aria-hidden />
                {t('profile.memberSince', { date: f.date(me.createdAt) })}
              </span>
              {me.lastLoginAt && (
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" aria-hidden />
                  {t('profile.lastLogin')}: {f.relative(me.lastLoginAt)}
                </span>
              )}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            className="sm:mt-3"
            busy={logout.isPending}
            onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}
          >
            <LogOut className="size-4" /> {t('topbar.logout')}
          </Button>
        </div>
        <div className="border-rule bg-rule grid grid-cols-2 gap-px border-t sm:grid-cols-4">
          <Stat label={t('profile.stat.factors')} value={factors.length} sub={factors.join(' + ') || '—'} />
          <Stat label={t('profile.stat.sessions')} value={sessions.data?.length ?? '—'} />
          <Stat
            label={t('profile.stat.logins')}
            value={ok ?? '—'}
            sub={failed > 0 ? t('profile.stat.failures', { n: failed }) : undefined}
          />
          <Stat label={t('profile.stat.apps')} value={apps.data?.length ?? '—'} />
        </div>
      </section>
      <LinkTabs
        label={t('nav.profile')}
        items={[
          { href: '/profile', label: t('profile.tab.overview'), exact: true },
          { href: '/profile/security', label: t('profile.tab.security') },
          { href: '/profile/activity', label: t('profile.tab.activity') },
          { href: '/profile/apps', label: t('profile.tab.apps') },
        ]}
      />
      {children}
      <AvatarDialog me={me} open={avatarOpen} onClose={() => setAvatarOpen(false)} />
    </div>
  );
}
