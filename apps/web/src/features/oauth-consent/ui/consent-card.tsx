'use client';

import type { OauthRequestInfoDto } from '@bioauth/contracts';
import { useMutation } from '@tanstack/react-query';
import {
  ArrowLeftRight,
  Check,
  Fingerprint,
  IdCard,
  KeyRound,
  Mail,
  ShieldCheck,
  UserRound,
} from 'lucide-react';

import { useViewer } from '@/entities/viewer';
import { apiSend } from '@/shared/api';
import { type TKey, useT } from '@/shared/i18n';
import { ApiErrorNotice, Avatar, Badge, Button } from '@/shared/ui';

const SCOPE_ICON = {
  openid: IdCard,
  profile: UserRound,
  email: Mail,
  roles: ShieldCheck,
  offline_access: KeyRound,
  biometrics: Fingerprint,
} as const;

/** Экран согласия: что получит приложение, от чьего имени и куда вернёт; решение уходит на сервер. */
export function ConsentCard({ request }: { request: OauthRequestInfoDto }) {
  const t = useT();
  const me = useViewer().data;
  const decide = useMutation({
    mutationFn: (approve: boolean) =>
      apiSend<{ redirectTo: string }>('POST', `/oauth/requests/${request.id}/decision`, { approve }),
    onSuccess: (r) => window.location.assign(r.redirectTo),
  });
  const name = request.user?.displayName ?? me?.displayName ?? '';
  return (
    <div className="border-rule bg-sheet overflow-hidden rounded-2xl border shadow-sm">
      <div className="profile-cover flex items-center justify-center gap-4 px-6 py-7">
        <Avatar src={me?.avatarUrl} name={name || '?'} size={56} className="ring-sheet ring-4" />
        <ArrowLeftRight className="text-graphite size-5" aria-hidden />
        <span className="bg-ink text-sheet ring-sheet flex size-14 items-center justify-center rounded-full font-serif text-2xl font-semibold ring-4">
          {request.client.name.slice(0, 1).toUpperCase()}
        </span>
      </div>
      <div className="flex flex-col gap-5 px-6 py-6">
        <div className="text-center">
          <h1 className="text-xl sm:text-2xl">{t('oauth.consentTitle', { app: request.client.name })}</h1>
          {request.client.description && (
            <p className="text-graphite mt-1 text-sm">{request.client.description}</p>
          )}
          <p className="text-graphite mt-2 text-sm">
            {t('oauth.consentAs', { name })}
            {request.client.firstParty && (
              <Badge tone="optimum" className="ml-2">
                {t('oauth.firstParty')}
              </Badge>
            )}
          </p>
        </div>
        <div>
          <p className="mb-2 text-sm font-medium">{t('oauth.willAccess')}</p>
          <ul className="border-rule divide-rule divide-y rounded-xl border">
            {request.scopes.map((s) => {
              const Icon = s in SCOPE_ICON ? SCOPE_ICON[s as keyof typeof SCOPE_ICON] : Check;
              return (
                <li key={s} className="flex items-center gap-3 px-4 py-3 text-sm">
                  <Icon className="text-frr size-4 shrink-0" aria-hidden />
                  <span className="flex-1">{t(`oauth.scope.${s}` as TKey)}</span>
                  <code className="text-graphite text-[11px]">{s}</code>
                </li>
              );
            })}
          </ul>
        </div>
        <ApiErrorNotice error={decide.error} />
        <div className="grid grid-cols-2 gap-3">
          <Button
            variant="secondary"
            busy={decide.isPending && !decide.variables}
            onClick={() => decide.mutate(false)}
          >
            {t('oauth.deny')}
          </Button>
          <Button busy={decide.isPending && decide.variables} onClick={() => decide.mutate(true)}>
            {t('oauth.allow')}
          </Button>
        </div>
        <p className="text-graphite text-center text-xs">
          {t('oauth.redirectNote', { host: request.redirectHost })}
        </p>
      </div>
    </div>
  );
}
