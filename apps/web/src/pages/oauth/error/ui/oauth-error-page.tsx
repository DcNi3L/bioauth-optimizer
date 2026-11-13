'use client';

import { TriangleAlert } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useT } from '@/shared/i18n';
import { AuthCard } from '@/widgets/auth-shell';

/** Ошибка, при которой вернуть пользователя в приложение небезопасно (неизвестный клиент, чужой redirect_uri). */
export function OauthErrorPage() {
  const t = useT();
  const p = useSearchParams();
  const error = p?.get('error') ?? 'invalid_request';
  const description = p?.get('error_description');
  return (
    <AuthCard
      width="sm"
      title={t('oauth.errorTitle')}
      subtitle={t('oauth.errorText')}
      icon={
        <span className="rounded-full bg-far-bg p-4 text-far">
          <TriangleAlert className="size-8" aria-hidden />
        </span>
      }
    >
      <div className="w-full rounded-lg border border-rule bg-paper/60 px-4 py-3 text-left">
        <code className="text-sm text-far">{error}</code>
        {description && <p className="mt-1 text-sm text-graphite">{description}</p>}
      </div>
      <Link
        href="/"
        data-variant="primary"
        className="inline-flex h-10 items-center justify-center rounded-md bg-ink px-4 text-sm font-medium text-sheet hover:bg-ink-hover"
      >
        {t('oauth.home')}
      </Link>
    </AuthCard>
  );
}
