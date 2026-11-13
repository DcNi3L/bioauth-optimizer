'use client';

import { ArrowRight, LogOut } from 'lucide-react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';

import { useOauthRequest } from '@/entities/oauth-client';
import { useTenantSettings } from '@/entities/tenant';
import { roleLabel, useLogout, useViewer } from '@/entities/viewer';
import { BiometricLogin, StaffLogin } from '@/features/authenticate';
import { CrossDeviceLogin } from '@/features/cross-device';
import { useT } from '@/shared/i18n';
import { hardNavigate } from '@/shared/lib/browser';
import { Avatar, Button, Notice, Segmented, Skeleton } from '@/shared/ui';
import { AuthCard } from '@/widgets/auth-shell';

type Mode = 'subject' | 'phone' | 'staff';

/**
 * Вход — отдельная страница без навигации консоли, как Universal Login в Auth0. С параметром ?oauth=<id> это
 * вход для стороннего приложения (OpenID Connect): после успеха сервер авторизации продолжает запрос и сам
 * перенаправляет на согласие или обратно в приложение.
 */
export function LoginPage() {
  const t = useT();
  const router = useRouter();
  const params = useSearchParams();
  const oauth = params?.get('oauth') ?? null;
  const request = useOauthRequest(oauth);
  const viewer = useViewer();
  const logout = useLogout();
  const { data: settings } = useTenantSettings();
  const [chosen, setChosen] = useState<Mode>('subject');
  const crossDevice = settings?.allowCrossDevice ?? true;
  const mode: Mode = chosen === 'phone' && !crossDevice ? 'subject' : chosen;

  const done = (staffNeedsPasskey = false) => {
    // Сотрудник без passkey не завершил двухфакторный вход: приложение его не примет — сначала passkey.
    if (oauth && !staffNeedsPasskey) {
      hardNavigate(`/oidc/authorize/resume?request=${encodeURIComponent(oauth)}`);
      return;
    }
    const next = params?.get('next');
    const safeNext = next && next.startsWith('/') && !next.startsWith('//') ? next : null;
    router.push(staffNeedsPasskey ? '/profile/security' : (safeNext ?? '/profile'));
  };

  const appName = request.data?.client.name;
  const product = settings?.productName ?? 'BioAuth';
  const title = appName
    ? t('authUi.titleFor', { app: appName })
    : (settings?.loginTitle ?? t('authUi.welcome'));
  const subtitle = appName
    ? t('authUi.subtitleFor', { product, app: appName })
    : (settings?.loginSubtitle ?? t('authUi.subtitle', { product }));
  const signup = settings?.allowSignup ?? true;

  // Уже вошли (и это не вход для приложения) — как Auth0: «Продолжить как …» или войти другим.
  if (!oauth && viewer.data) {
    const me = viewer.data;
    return (
      <AuthCard title={t('authUi.signedInTitle')} subtitle={t('authUi.signedInText')} width="sm">
        <div className="flex items-center gap-3 rounded-xl border border-rule bg-paper/60 p-3">
          <Avatar src={me.avatarUrl} name={me.displayName} size={44} />
          <div className="min-w-0 text-left">
            <p className="truncate font-medium">{me.displayName}</p>
            <p className="truncate text-xs text-graphite">
              @{me.login} · {roleLabel(t, me.role)}
            </p>
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <Button
            className="w-full"
            onClick={() => router.push(me.role === 'subject' ? '/profile' : '/admin')}
          >
            {t('authUi.continueAs')} <ArrowRight className="size-4" aria-hidden />
          </Button>
          <Button
            variant="secondary"
            className="w-full"
            busy={logout.isPending}
            onClick={() => logout.mutate()}
          >
            <LogOut className="size-4" aria-hidden /> {t('authUi.useAnother')}
          </Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={title}
      subtitle={mode === 'staff' ? t('auth.staffIntro') : subtitle}
      footer={
        signup && (
          <>
            {t('auth.noAccount')}{' '}
            <Link
              href={oauth ? `/enroll?oauth=${encodeURIComponent(oauth)}` : '/enroll'}
              className="font-medium text-frr underline-offset-4 hover:underline"
            >
              {t('auth.register')}
            </Link>
          </>
        )
      }
    >
      {oauth && request.isError && <Notice tone="caution">{t('oauth.expired')}</Notice>}
      {viewer.isPending ? (
        <Skeleton className="h-40 w-full" />
      ) : (
        <>
          <Segmented<Mode>
            fill
            label={t('auth.title')}
            value={mode}
            onChange={setChosen}
            options={[
              { value: 'subject', label: t('auth.tabBiometric') },
              ...(crossDevice ? [{ value: 'phone' as const, label: t('auth.tabPhone') }] : []),
              { value: 'staff', label: t('auth.tabStaff') },
            ]}
          />
          {mode === 'subject' ? (
            <BiometricLogin onSuccess={() => done()} />
          ) : mode === 'phone' ? (
            <CrossDeviceLogin onSuccess={() => done()} />
          ) : (
            <StaffLogin onSuccess={done} />
          )}
        </>
      )}
    </AuthCard>
  );
}
