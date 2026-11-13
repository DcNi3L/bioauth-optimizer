'use client';

import type { OauthClientDto } from '@bioauth/contracts';
import { useQuery } from '@tanstack/react-query';
import { AppWindow, Plus } from 'lucide-react';
import { useState } from 'react';

import { useOauthClients } from '@/entities/oauth-client';
import { useViewer } from '@/entities/viewer';
import {
  ClientActions,
  ClientFormDialog,
  CopyButton,
  InitialTokens,
} from '@/features/admin/manage-oauth-client';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { ApiErrorNotice, Badge, Button, EmptyState, Panel, Skeleton } from '@/shared/ui';

interface Discovery {
  issuer: string;
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
  jwks_uri: string;
  introspection_endpoint?: string;
  revocation_endpoint?: string;
  end_session_endpoint?: string;
  registration_endpoint?: string;
}

const useDiscovery = () =>
  useQuery({
    queryKey: ['oidc', 'discovery'],
    queryFn: async () => (await fetch('/.well-known/openid-configuration')).json() as Promise<Discovery>,
  });

function Endpoints() {
  const t = useT();
  const d = useDiscovery();
  if (!d.data) return <Skeleton className="h-40 w-full" />;
  const rows: [string, string | undefined][] = [
    [t('admin.clients.issuer'), d.data.issuer],
    ['discovery', `${d.data.issuer}/.well-known/openid-configuration`],
    ['authorize', d.data.authorization_endpoint],
    ['token', d.data.token_endpoint],
    ['userinfo', d.data.userinfo_endpoint],
    ['jwks', d.data.jwks_uri],
    ['introspect', d.data.introspection_endpoint],
    ['revoke', d.data.revocation_endpoint],
    ['logout', d.data.end_session_endpoint],
    ['register', d.data.registration_endpoint],
  ];
  const issuer = d.data.issuer;
  // Конечные точки — относительно издателя: короче и читаются без переносов; копируется полный адрес.
  const short = (v: string) => (v.startsWith(issuer) && v !== issuer ? v.slice(issuer.length) : v);
  return (
    <dl className="divide-y divide-rule">
      {rows
        .filter((r): r is [string, string] => !!r[1])
        .map(([k, v]) => (
          <div key={k} className="flex items-center gap-3 py-1.5">
            <dt className="w-20 shrink-0 text-xs text-graphite">{k}</dt>
            <dd className="min-w-0 flex-1 truncate font-mono text-[12.5px]" title={v}>
              {short(v)}
            </dd>
            <CopyButton value={v} iconOnly />
          </div>
        ))}
    </dl>
  );
}

function ClientCard({ c, canEdit }: { c: OauthClientDto; canEdit: boolean }) {
  const t = useT();
  const f = useFormat();
  return (
    <li
      className={`flex flex-col gap-3 rounded-xl border border-rule bg-sheet p-4 ${c.disabled ? 'opacity-70' : ''}`}
    >
      <div className="flex items-start gap-3">
        <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-frr-bg font-serif text-xl font-semibold text-frr">
          {c.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-medium">
            {c.name}
            <Badge tone={c.type === 'confidential' ? 'ink' : 'neutral'}>
              {c.type === 'confidential' ? t('admin.clients.confidential') : t('admin.clients.public')}
            </Badge>
            {c.firstParty && <Badge tone="optimum">{t('admin.clients.firstPartyBadge')}</Badge>}
            {c.pendingReview ? (
              <Badge tone="caution">{t('admin.clients.pending')}</Badge>
            ) : (
              c.disabled && <Badge tone="far">{t('admin.clients.disabled')}</Badge>
            )}
          </p>
          <p className="num mt-0.5 text-xs text-graphite">
            {c.clientId} · {f.date(c.createdAt)} · {t('admin.clients.grantsN', { n: c.activeGrants })}
          </p>
          {c.description && <p className="mt-1 text-sm text-graphite">{c.description}</p>}
        </div>
      </div>
      <div className="flex flex-wrap gap-1">
        {c.grantTypes.map((g) => (
          <Badge key={g}>{g}</Badge>
        ))}
        {c.scopes.map((s) => (
          <Badge key={s} tone="frr">
            {s}
          </Badge>
        ))}
      </div>
      {c.redirectUris.length > 0 && (
        <ul className="font-mono text-[12px] break-all text-graphite">
          {c.redirectUris.map((u) => (
            <li key={u}>↩ {u}</li>
          ))}
        </ul>
      )}
      {canEdit && <ClientActions client={c} />}
    </li>
  );
}

/** Приложения OAuth: регистрация клиентов сервера авторизации, ротация секретов, конечные точки. */
export function AdminClientsPage() {
  const t = useT();
  const me = useViewer().data;
  const clients = useOauthClients();
  const [creating, setCreating] = useState(false);
  const discovery = useDiscovery();
  const canEdit = me?.role === 'admin' && me.mfaComplete;
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="flex flex-col gap-4">
        <div className="flex items-center justify-between gap-2">
          <h2 className="text-lg">{t('nav.clients')}</h2>
          <span
            title={
              canEdit
                ? undefined
                : t(me?.role === 'admin' ? 'usersExport.mfaFirst' : 'usersExport.adminOnlyAction')
            }
          >
            <Button onClick={() => setCreating(true)} disabled={!canEdit}>
              <Plus className="size-4" /> {t('admin.clients.create')}
            </Button>
          </span>
        </div>
        <ApiErrorNotice error={clients.error} />
        {!clients.data ? (
          <Skeleton className="h-48 w-full" />
        ) : clients.data.length === 0 ? (
          <EmptyState icon={<AppWindow />} title={t('admin.clients.empty')} />
        ) : (
          <ul className="flex flex-col gap-3">
            {clients.data.map((c) => (
              <ClientCard key={c.clientId} c={c} canEdit={canEdit} />
            ))}
          </ul>
        )}
      </div>
      <div className="flex h-fit flex-col gap-6 xl:sticky xl:top-20">
        <Panel title={t('admin.clients.endpoints')}>
          <Endpoints />
        </Panel>
        {canEdit && (
          <Panel title={t('admin.clients.regTitle')} description={t('admin.clients.regDesc')}>
            <div>
              <InitialTokens
                enabled={!!discovery.data?.registration_endpoint}
                registrationEndpoint={discovery.data?.registration_endpoint}
              />
            </div>
          </Panel>
        )}
      </div>
      {creating && <ClientFormDialog open client={null} onClose={() => setCreating(false)} />}
    </div>
  );
}
