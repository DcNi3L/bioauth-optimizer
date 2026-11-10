'use client';

import { ArrowLeft, CalendarDays, Clock3, KeyRound, Mail, ScanFace } from 'lucide-react';
import Link from 'next/link';

import { useAdminUser } from '@/entities/admin-user';
import { roleLabel, useViewer } from '@/entities/viewer';
import { UserActions } from '@/features/admin/manage-user';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { ApiErrorNotice, Avatar, Badge, EmptyState, Panel, Skeleton } from '@/shared/ui';
import { LoginHistory, SessionList } from '@/widgets/account-activity';

/** Карточка пользователя: сведения, действия администратора, сессии, история входов и разрешения приложениям. */
export function AdminUserPage({ id }: { id: string }) {
  const t = useT();
  const f = useFormat();
  const me = useViewer().data;
  const detail = useAdminUser(id);
  const d = detail.data;
  return (
    <div className="flex flex-col gap-6">
      <Link
        href="/admin/users"
        className="text-graphite hover:text-ink inline-flex w-fit items-center gap-1.5 text-sm"
      >
        <ArrowLeft className="size-4" /> {t('admin.user.back')}
      </Link>
      <ApiErrorNotice error={detail.error} />
      {!d ? (
        <Skeleton className="h-40 w-full rounded-2xl" />
      ) : (
        <>
          <section className="border-rule bg-sheet flex flex-col gap-4 rounded-2xl border p-5 sm:flex-row sm:items-center">
            <Avatar src={d.user.avatarUrl} name={d.user.displayName} size={80} />
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate text-2xl">{d.user.displayName}</h1>
                <Badge tone={d.user.role === 'subject' ? 'neutral' : 'frr'}>
                  {roleLabel(t, d.user.role)}
                </Badge>
              </div>
              <p className="text-graphite mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm">
                <span className="num">@{d.user.login}</span>
                <span className="inline-flex items-center gap-1.5">
                  <Mail className="size-3.5" /> {d.user.email ?? t('profile.noEmail')}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <CalendarDays className="size-3.5" />{' '}
                  {t('admin.user.created', { date: f.date(d.user.createdAt) })}
                </span>
                <span className="inline-flex items-center gap-1.5">
                  <Clock3 className="size-3.5" /> {t('profile.lastLogin')}:{' '}
                  {d.user.lastLoginAt ? f.relative(d.user.lastLoginAt) : t('common.never')}
                </span>
              </p>
              <p className="mt-2 flex flex-wrap gap-2">
                <Badge tone={d.user.face ? 'optimum' : 'neutral'}>
                  <ScanFace className="size-3.5" />{' '}
                  {d.user.face ? t('profile.face') : `${t('profile.face')}: ${t('profile.faceNo')}`}
                </Badge>
                <Badge tone={d.user.passkeys ? 'frr' : 'neutral'}>
                  <KeyRound className="size-3.5" /> passkey: {d.user.passkeys}
                </Badge>
                <Badge tone={d.user.consent ? 'optimum' : 'neutral'}>
                  {t('profile.consent')}: {d.user.consent ? t('common.yes') : t('common.no')}
                </Badge>
              </p>
            </div>
          </section>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Panel title={t('admin.user.actions')}>
              <UserActions
                key={`${d.user.role}|${String(d.user.disabled)}`}
                user={d.user}
                self={me?.id === d.user.id}
                canEdit={me?.role === 'admin' && me.mfaComplete}
              />
            </Panel>
            <Panel title={t('profile.sessions.title')}>
              {d.sessions.length ? (
                <SessionList sessions={d.sessions.map((s) => ({ ...s, current: false }))} revocable={false} />
              ) : (
                <EmptyState title={t('profile.sessions.none')} />
              )}
            </Panel>
          </div>
          <Panel title={t('profile.history.title')}>
            <LoginHistory events={d.history} />
          </Panel>
          {d.apps.length > 0 && (
            <Panel title={t('admin.user.apps')}>
              <ul className="divide-rule divide-y">
                {d.apps.map((a) => (
                  <li
                    key={a.clientId}
                    className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm"
                  >
                    <span className="font-medium">
                      {a.name} <span className="text-graphite num text-xs">{a.clientId}</span>
                    </span>
                    <span className="flex flex-wrap gap-1">
                      {a.scopes.map((s) => (
                        <Badge key={s} tone="frr">
                          {s}
                        </Badge>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
        </>
      )}
    </div>
  );
}
