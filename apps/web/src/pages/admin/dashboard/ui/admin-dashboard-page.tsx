'use client';

import type { LoginEventDto, Role } from '@bioauth/contracts';
import { Activity, AppWindow, ArrowRight, MonitorSmartphone, Users } from 'lucide-react';
import Link from 'next/link';

import { methodLabel, reasonLabel } from '@/entities/account';
import { useAdminLogins, useAdminStats } from '@/entities/admin-user';
import { describeStep, usePolicies } from '@/entities/policy';
import { roleLabel } from '@/entities/viewer';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Badge, Panel, Skeleton, StatCard } from '@/shared/ui';
import { LoginHistory } from '@/widgets/account-activity';
import { LoginsChart, ShareBars } from '@/widgets/admin-charts';

/** Сводка админ-панели: показатели, входы за 14 дней, способы и причины отказов, политика, последние входы. */
export function AdminDashboardPage() {
  const t = useT();
  const stats = useAdminStats();
  const logins = useAdminLogins(8);
  const policies = usePolicies();
  const s = stats.data;
  const active = policies.data?.find((p) => p.status === 'active');
  const pending = policies.data?.filter((p) => p.status === 'proposed') ?? [];
  return (
    <div className="flex flex-col gap-6">
      <ApiErrorNotice error={stats.error} />
      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        {s ? (
          <>
            <StatCard
              label={t('admin.dash.users')}
              value={s.users.total}
              icon={<Users />}
              sub={t('admin.dash.usersSub', { face: s.users.withFace, pk: s.users.withPasskey })}
            />
            <StatCard
              label={t('admin.dash.sessions')}
              value={s.sessions.active}
              icon={<MonitorSmartphone />}
              tone="frr"
              sub={t('admin.dash.sessionsSub', { n: s.sessions.activeUsers })}
            />
            <StatCard
              label={t('admin.dash.logins24')}
              value={s.logins.last24h.success}
              icon={<Activity />}
              tone="optimum"
              sub={t('admin.dash.logins24Sub', { n: s.logins.last24h.failure })}
            />
            <StatCard
              label={t('admin.dash.clients')}
              value={s.oauth.clients}
              icon={<AppWindow />}
              tone="caution"
              sub={t('admin.dash.clientsSub', { n: s.oauth.activeGrants })}
            />
          </>
        ) : (
          Array.from({ length: 4 }, (_, i) => <Skeleton key={i} className="h-32 rounded-xl" />)
        )}
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Panel title={t('admin.dash.loginsChart')}>
          {s ? <LoginsChart days={s.logins.byDay} /> : <Skeleton className="h-64 w-full" />}
        </Panel>
        <Panel title={t('admin.dash.methods')}>
          {s && (
            <ShareBars
              rows={Object.entries(s.logins.byMethod)
                .sort((a, b) => b[1] - a[1])
                .map(([m, n]) => ({ label: methodLabel(t, m as LoginEventDto['method']), value: n }))}
            />
          )}
        </Panel>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-3">
        <Panel title={t('admin.dash.reasons')}>
          {s &&
            (s.logins.topReasons.length ? (
              <ShareBars
                tone="far"
                rows={s.logins.topReasons.map((r) => ({
                  label: reasonLabel(t, r.reason) ?? r.reason,
                  value: r.n,
                }))}
              />
            ) : (
              <p className="text-sm text-graphite">{t('admin.dash.noReasons')}</p>
            ))}
        </Panel>
        <Panel title={t('admin.dash.roles')}>
          {s && (
            <>
              <ShareBars
                tone="ink"
                rows={Object.entries(s.users.byRole).map(([r, n]) => ({
                  label: roleLabel(t, r as Role),
                  value: n,
                }))}
              />
              {(s.users.locked > 0 || s.users.disabled > 0) && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {s.users.locked > 0 && (
                    <Badge tone="caution">{t('admin.dash.locked', { n: s.users.locked })}</Badge>
                  )}
                  {s.users.disabled > 0 && (
                    <Badge tone="far">{t('admin.dash.disabled', { n: s.users.disabled })}</Badge>
                  )}
                </div>
              )}
            </>
          )}
        </Panel>
        <Panel
          title={t('admin.dash.policy')}
          actions={
            <Link
              href="/admin/policies"
              className="inline-flex items-center gap-1 text-sm text-frr hover:underline"
            >
              {t('admin.dash.policyOpen')} <ArrowRight className="size-3.5" />
            </Link>
          }
        >
          {active ? (
            <div className="flex flex-col gap-2">
              <Badge tone="optimum" dot className="w-fit">
                v{active.version}
              </Badge>
              <ol className="list-inside list-decimal text-sm">
                {active.steps.map((st, i) => (
                  <li key={i}>{describeStep(t, st)}</li>
                ))}
              </ol>
              {pending.length > 0 && (
                <p className="text-sm text-caution">
                  {t('admin.dash.attention')}: {pending.map((p) => `v${p.version}`).join(', ')}
                </p>
              )}
            </div>
          ) : (
            <Skeleton className="h-16 w-full" />
          )}
        </Panel>
      </div>

      <Panel
        title={t('admin.dash.recent')}
        actions={
          <Link
            href="/admin/logins"
            className="inline-flex items-center gap-1 text-sm text-frr hover:underline"
          >
            {t('admin.dash.all')} <ArrowRight className="size-3.5" />
          </Link>
        }
      >
        <ApiErrorNotice error={logins.error} />
        {logins.data ? <LoginHistory events={logins.data} showUser /> : <Skeleton className="h-40 w-full" />}
      </Panel>
    </div>
  );
}
