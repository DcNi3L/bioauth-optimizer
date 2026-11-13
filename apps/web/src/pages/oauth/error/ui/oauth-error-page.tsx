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
      <span className="rounded-full bg-far-bg p-4 text-far">
        <TriangleAlert className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl">{t('oauth.errorTitle')}</h1>
      <p className="text-graphite">{t('oauth.errorText')}</p>
      <div className="w-full rounded-lg border border-rule bg-sheet px-4 py-3 text-left">
        <code className="text-sm text-far">{error}</code>
        {description && <p className="mt-1 text-sm text-graphite">{description}</p>}
      </div>
      <Link
        href="/"
        className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-sheet hover:bg-ink-hover"
      >
        {t('oauth.home')}
      </Link>
    </div>
  );
}
