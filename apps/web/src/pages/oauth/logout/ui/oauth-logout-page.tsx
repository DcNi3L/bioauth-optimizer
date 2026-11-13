'use client';

import { oauthLogoutInfoSchema, oauthRedirectSchema } from '@bioauth/contracts';
import { useMutation, useQuery } from '@tanstack/react-query';
import { LogOut } from 'lucide-react';
import { useSearchParams } from 'next/navigation';

import { useViewer } from '@/entities/viewer';
import { apiGet, apiSend } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Avatar, Button } from '@/shared/ui';

/**
 * Подтверждение выхода по запросу приложения (RP-Initiated Logout без id_token_hint): без него любой сайт
 * мог бы завершить сессию пользователя простой ссылкой.
 */
export function OauthLogoutPage() {
  const t = useT();
  const p = useSearchParams();
  const clientId = p?.get('client_id') ?? undefined;
  const me = useViewer().data;
  const info = useQuery({
    queryKey: ['oauth', 'logout', clientId ?? ''],
    queryFn: () =>
      apiGet(`/oauth/logout?client_id=${encodeURIComponent(clientId ?? '')}`, oauthLogoutInfoSchema),
  });
  const logout = useMutation({
    mutationFn: () =>
      apiSend(
        'POST',
        '/oauth/logout',
        {
          clientId,
          postLogoutRedirectUri: p?.get('post_logout_redirect_uri') ?? undefined,
          state: p?.get('state') ?? undefined,
        },
        oauthRedirectSchema,
      ),
    onSuccess: (r) => window.location.assign(r.redirectTo),
  });
  const app = info.data?.clientName;
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-5 px-4 py-16 text-center">
      {me ? (
        <Avatar src={me.avatarUrl} name={me.displayName} size={72} />
      ) : (
        <span className="rounded-full bg-paper p-4 text-graphite">
          <LogOut className="size-8" aria-hidden />
        </span>
      )}
      <div>
        <h1 className="text-2xl">{t('logout.title')}</h1>
        <p className="mt-2 text-graphite">{app ? t('logout.textApp', { app }) : t('logout.text')}</p>
      </div>
      <ApiErrorNotice error={logout.error} />
      <div className="grid w-full grid-cols-2 gap-3">
        <Button
          variant="secondary"
          onClick={() => (window.history.length > 1 ? window.history.back() : window.location.assign('/'))}
        >
          {t('logout.cancel')}
        </Button>
        <Button busy={logout.isPending} onClick={() => logout.mutate()}>
          {t('logout.confirm')}
        </Button>
      </div>
    </div>
  );
}
