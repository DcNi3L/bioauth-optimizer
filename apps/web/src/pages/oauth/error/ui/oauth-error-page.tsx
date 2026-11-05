'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useT } from '@/shared/i18n';

/** Ошибка, при которой вернуть пользователя в приложение небезопасно (неизвестный клиент, чужой redirect_uri). */
export function OauthErrorPage() {
  const t = useT();
  const p = useSearchParams();
  const error = p?.get('error') ?? 'invalid_request';
  const description = p?.get('error_description');
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-16 text-center">
      <span className="bg-far-bg text-far rounded-full p-4">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl">{t('oauth.errorTitle')}</h1>
      <p className="text-graphite">{t('oauth.errorText')}</p>
      <div className="border-rule bg-sheet w-full rounded-lg border px-4 py-3 text-left">
        <code className="text-far text-sm">{error}</code>
        {description && <p className="text-graphite mt-1 text-sm">{description}</p>}
      </div>
      <Link
        href="/"
        className="bg-ink text-sheet hover:bg-ink-hover rounded-md px-4 py-2 text-sm font-medium"
      >
        {t('oauth.home')}
      </Link>
    </div>
  );
}
