'use client';

import type { AdminUserDto, Role } from '@bioauth/contracts';
import { ChevronLeft, ChevronRight, KeyRound, ScanFace, Search, Users } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';

import { useAdminUsers, type UsersFilter } from '@/entities/admin-user';
import { roleLabel, useViewer } from '@/entities/viewer';
import { CreateStaffButton } from '@/features/admin/create-staff';
import { type TFn, useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import {
  ApiErrorNotice,
  Avatar,
  Badge,
  type BadgeTone,
  Button,
  EmptyState,
  Panel,
  Skeleton,
} from '@/shared/ui';

const ROLES: Role[] = ['subject', 'admin', 'researcher', 'auditor'];
const PAGE = 20;

function status(t: TFn, u: AdminUserDto): { tone: BadgeTone; label: string } {
  if (u.disabled) return { tone: 'far', label: t('admin.users.disabled') };
  if (u.lockedUntil && new Date(u.lockedUntil) > new Date())
    return { tone: 'caution', label: t('admin.users.locked') };
  return { tone: 'optimum', label: t('admin.users.active') };
}

function Factors({ u }: { u: AdminUserDto }) {
  return (
    <span className="flex items-center gap-1.5">
      <ScanFace
        className={`size-4 ${u.face ? 'text-optimum' : 'text-rule'}`}
        aria-label={u.face ? 'face' : undefined}
      />
      <span className={`flex items-center gap-0.5 ${u.passkeys ? 'text-frr' : 'text-rule'}`}>
        <KeyRound className="size-4" />
        {u.passkeys > 0 && <span className="num text-xs">{u.passkeys}</span>}
      </span>
    </span>
  );
}

/** Пользователи: поиск, фильтры по роли и статусу, постраничный список; на телефоне — карточки. */
export function AdminUsersPage() {
  const t = useT();
  const f = useFormat();
  const me = useViewer().data;
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<UsersFilter>({ q: '', role: '', status: '', offset: 0, limit: PAGE });
  useEffect(() => {
    const id = setTimeout(
      () => setFilter((x) => (x.q === q.trim() ? x : { ...x, q: q.trim(), offset: 0 })),
      250,
    );
    return () => clearTimeout(id);
  }, [q]);
  const users = useAdminUsers(filter);
  const data = users.data;
  const pages = data ? Math.max(1, Math.ceil(data.total / PAGE)) : 1;
  const page = Math.floor(filter.offset / PAGE) + 1;
  const select =
    'border-rule bg-sheet text-ink focus:border-frr h-10 rounded-md border px-3 text-sm outline-none';

  return (
    <Panel>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          <label className="border-rule bg-sheet focus-within:border-frr flex h-10 min-w-0 flex-1 basis-64 items-center gap-2 rounded-md border px-3">
            <Search className="text-graphite size-4 shrink-0" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t('admin.users.search')}
              aria-label={t('admin.users.search')}
              className="min-w-0 flex-1 bg-transparent text-sm outline-none"
            />
          </label>
          <select
            aria-label={t('admin.users.role')}
            className={select}
            value={filter.role}
            onChange={(e) => setFilter({ ...filter, role: e.target.value as Role | '', offset: 0 })}
          >
            <option value="">{t('admin.users.allRoles')}</option>
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(t, r)}
              </option>
            ))}
          </select>
          <select
            aria-label={t('admin.users.status')}
            className={select}
            value={filter.status}
            onChange={(e) =>
              setFilter({ ...filter, status: e.target.value as UsersFilter['status'], offset: 0 })
            }
          >
            <option value="">{t('admin.users.allStatuses')}</option>
            <option value="active">{t('admin.users.active')}</option>
            <option value="locked">{t('admin.users.locked')}</option>
            <option value="disabled">{t('admin.users.disabled')}</option>
          </select>
          <CreateStaffButton disabled={me?.role !== 'admin' || !me.mfaComplete} />
        </div>
        <ApiErrorNotice error={users.error} />
        {!data ? (
          <Skeleton className="h-64 w-full" />
        ) : data.items.length === 0 ? (
          <EmptyState icon={<Users />} title={t('admin.users.empty')} />
        ) : (
          <>
            <div className="hidden overflow-x-auto md:block">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{t('admin.users.user')}</th>
                    <th>{t('admin.users.role')}</th>
                    <th>{t('admin.users.factors')}</th>
                    <th className="r">{t('admin.users.sessions')}</th>
                    <th>{t('admin.users.lastLogin')}</th>
                    <th>{t('admin.users.status')}</th>
                  </tr>
                </thead>
                <tbody className={users.isPlaceholderData ? 'opacity-60' : ''}>
                  {data.items.map((u) => {
                    const st = status(t, u);
                    return (
                      <tr key={u.id} className="hover:bg-hover/60">
                        <td>
                          <Link href={`/admin/users/${u.id}`} className="group flex items-center gap-3">
                            <Avatar src={u.avatarUrl} name={u.displayName} size={34} />
                            <span className="min-w-0">
                              <span className="group-hover:text-frr block truncate font-medium">
                                {u.displayName}
                              </span>
                              <span className="text-graphite num block truncate text-xs">
                                {u.login}
                                {u.email && ` · ${u.email}`}
                              </span>
                            </span>
                          </Link>
                        </td>
                        <td>
                          <Badge tone={u.role === 'subject' ? 'neutral' : 'frr'}>
                            {roleLabel(t, u.role)}
                          </Badge>
                        </td>
                        <td>
                          <Factors u={u} />
                        </td>
                        <td className="r num">{u.activeSessions}</td>
                        <td className="text-graphite whitespace-nowrap">
                          {u.lastLoginAt ? f.relative(u.lastLoginAt) : t('common.never')}
                        </td>
                        <td>
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <ul className="divide-rule flex flex-col divide-y md:hidden">
              {data.items.map((u) => {
                const st = status(t, u);
                return (
                  <li key={u.id}>
                    <Link href={`/admin/users/${u.id}`} className="flex items-center gap-3 py-3">
                      <Avatar src={u.avatarUrl} name={u.displayName} size={40} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{u.displayName}</span>
                        <span className="text-graphite num block truncate text-xs">
                          {u.login} · {roleLabel(t, u.role)}
                        </span>
                        <span className="mt-1 flex items-center gap-2">
                          <Badge tone={st.tone} dot>
                            {st.label}
                          </Badge>
                          <Factors u={u} />
                        </span>
                      </span>
                      <ChevronRight className="text-graphite size-4" />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </>
        )}
        {data && (
          <div className="border-rule flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm">
            <span className="text-graphite">{t('admin.users.total', { n: data.total })}</span>
            <span className="flex items-center gap-2">
              <span className="text-graphite">{t('admin.users.page', { p: page, n: pages })}</span>
              <Button
                size="sm"
                variant="secondary"
                aria-label={t('admin.users.prev')}
                disabled={filter.offset === 0}
                onClick={() => setFilter({ ...filter, offset: Math.max(0, filter.offset - PAGE) })}
              >
                <ChevronLeft className="size-4" />
              </Button>
              <Button
                size="sm"
                variant="secondary"
                aria-label={t('admin.users.next')}
                disabled={page >= pages}
                onClick={() => setFilter({ ...filter, offset: filter.offset + PAGE })}
              >
                <ChevronRight className="size-4" />
              </Button>
            </span>
          </div>
        )}
      </div>
    </Panel>
  );
}
