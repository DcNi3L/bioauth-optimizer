'use client';

import { KeyRound, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { useOauthRequest } from '@/entities/oauth-client';
import { BiometricLogin, StaffLogin } from '@/features/authenticate';
import { useT } from '@/shared/i18n';
import { Notice, Panel, Segmented } from '@/shared/ui';

type Mode = 'subject' | 'staff';

/**
 * Вход. С параметром ?oauth=<id> — это вход для стороннего приложения (OpenID Connect): после успеха
 * сервер авторизации продолжает запрос и сам перенаправляет на согласие или обратно в приложение.
 */
export function LoginPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const oauth = params?.get('oauth') ?? null;
  const request = useOauthRequest(oauth);
  const [mode, setMode] = useState<Mode>('subject');

  const done = (staffNeedsPasskey = false) => {
    // Сотрудник без passkey не завершил двухфакторный вход: приложение его не примет — сначала passkey.
    if (oauth && !staffNeedsPasskey) {
      window.location.assign(`/oidc/authorize/resume?request=${encodeURIComponent(oauth)}`);
      return;
    }
    router.push(staffNeedsPasskey ? '/profile/security' : '/profile');
  };

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      {oauth && request.data && (
        <section className="border-frr/30 bg-frr-bg text-frr-ink flex items-start gap-3 rounded-xl border p-4">
          <span className="bg-sheet text-frr flex size-10 shrink-0 items-center justify-center rounded-lg font-serif text-lg font-semibold">
            {request.data.client.name.slice(0, 1).toUpperCase()}
          </span>
          <div>
            <p className="font-medium">{t('oauth.loginFor', { app: request.data.client.name })}</p>
            <p className="mt-0.5 text-sm opacity-90">{t('oauth.loginForText')}</p>
          </div>
        </section>
      )}
      {oauth && request.isError && <Notice tone="caution">{t('oauth.expired')}</Notice>}
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">{t('auth.title')}</h1>
        <p className="text-graphite">{mode === 'subject' ? t('auth.subtitle') : t('auth.staffIntro')}</p>
      </header>
      <Segmented<Mode>
        label={t('auth.title')}
        value={mode}
        onChange={setMode}
        options={[
          { value: 'subject', label: t('auth.tabBiometric') },
          { value: 'staff', label: t('auth.tabStaff') },
        ]}
      />
      <Panel>
        {mode === 'subject' ? <BiometricLogin onSuccess={() => done()} /> : <StaffLogin onSuccess={done} />}
      </Panel>
      <div className="text-graphite flex flex-wrap items-center justify-between gap-3 text-sm">
        <p>
          {t('auth.noAccount')}{' '}
          <Link href="/enroll" className="text-frr underline underline-offset-4">
            {t('auth.register')}
          </Link>
        </p>
        <p className="flex items-center gap-3 text-xs">
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5" aria-hidden /> ISO/IEC 30107-3 PAD
          </span>
          <span className="inline-flex items-center gap-1">
            <KeyRound className="size-3.5" aria-hidden /> FIDO2 / WebAuthn
          </span>
        </p>
      </div>
    </div>
  );
}
