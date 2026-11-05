'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect } from 'react';

import { useOauthRequest } from '@/entities/oauth-client';
import { useViewer } from '@/entities/viewer';
import { ConsentCard } from '@/features/oauth-consent';
import { useT } from '@/shared/i18n';
import { Notice, Skeleton } from '@/shared/ui';

export function OauthConsentPage() {
  const t = useT();
  const router = useRouter();
  const id = useSearchParams()?.get('request') ?? null;
  const viewer = useViewer();
  const request = useOauthRequest(id);
  // Сессия могла истечь между входом и согласием — снова на вход с тем же запросом.
  useEffect(() => {
    if (id && viewer.data === null) router.replace(`/login?oauth=${encodeURIComponent(id)}`);
  }, [id, viewer.data, router]);
  return (
    <div className="mx-auto flex max-w-md flex-col gap-4 px-4 py-8 sm:py-14">
      {!id || request.isError ? (
        <Notice tone="caution">{t('oauth.expired')}</Notice>
      ) : request.data ? (
        <ConsentCard request={request.data} />
      ) : (
        <Skeleton className="h-96 w-full rounded-2xl" />
      )}
    </div>
  );
}
