'use client';

import { ArrowRight, Check } from 'lucide-react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';

import { useTenantSettings } from '@/entities/tenant';
import { isStaff, useViewer } from '@/entities/viewer';
import { EnrollFace } from '@/features/capture-face';
import { ConsentForm } from '@/features/give-consent';
import { RegisterPasskey } from '@/features/register-passkey';
import { RegisterSubjectForm } from '@/features/register-subject';
import { type TKey, useT } from '@/shared/i18n';
import { ApiErrorNotice, Notice, Skeleton } from '@/shared/ui';
import { AuthCard } from '@/widgets/auth-shell';

const STEPS: readonly TKey[] = [
  'enroll.stepAccount',
  'enroll.stepConsent',
  'enroll.stepFace',
  'enroll.stepPasskey',
];
/** Короткие подписи для индикатора: полные названия шагов в четыре колонки не помещаются. */
const SHORT: readonly TKey[] = [
  'authUi.short.account',
  'authUi.short.consent',
  'authUi.short.face',
  'authUi.short.passkey',
];

/** Индикатор шагов мастера: выполненные — с галочкой, текущий выделен; на телефоне — без подписей (шаг назван ниже). */
function Stepper({ current, done }: { current: number; done: (i: number) => boolean }) {
  const t = useT();
  return (
    <ol className="grid grid-cols-4 gap-2" aria-label={t('authUi.steps')}>
      {STEPS.map((key, i) => {
        const isDone = done(i);
        const isCurrent = i === current;
        return (
          <li key={key} className="flex flex-col gap-2" aria-current={isCurrent ? 'step' : undefined}>
            <span
              className={`h-1 rounded-full ${isDone ? 'bg-optimum' : isCurrent ? 'bg-ink' : 'bg-rule'}`}
              aria-hidden
            />
            <span className="flex items-center gap-1.5 text-xs">
              <span
                className={`num inline-flex size-5 shrink-0 items-center justify-center rounded-full text-[11px] ${
                  isDone
                    ? 'bg-optimum text-sheet'
                    : isCurrent
                      ? 'bg-ink text-sheet'
                      : 'border border-rule text-graphite'
                }`}
                aria-hidden
              >
                {isDone ? <Check className="size-3" /> : i + 1}
              </span>
              <span
                className={`truncate max-sm:sr-only ${isCurrent ? 'font-medium text-ink' : 'text-graphite'}`}
              >
                {t(SHORT[i]!)}
                {isDone && <span className="sr-only"> — {t('enroll.completed')}</span>}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Регистрация субъекта (UC-1–UC-3) — мастер на отдельной странице без навигации: учётная запись → согласие →
 * лицо → passkey. Показан только текущий шаг, остальные — в индикаторе сверху.
 */
export function EnrollPage() {
  const t = useT();
  const viewer = useViewer();
  const oauth = useSearchParams()?.get('oauth') ?? null;
  const { data: settings } = useTenantSettings();
  const me = viewer.data ?? null;
  const hasAccount = me !== null;
  const hasConsent = !!me?.consent;
  const hasFace = !!me?.face;
  const passkeys = me?.passkeys ?? 0;
  const done = [hasAccount, hasConsent, hasFace, passkeys > 0];
  const current = !hasAccount ? 0 : !hasConsent ? 1 : !hasFace ? 2 : 3;
  const loginHref = oauth ? `/login?oauth=${encodeURIComponent(oauth)}` : '/login';
  const closed = settings?.allowSignup === false && !hasAccount;
  const finish = oauth ? `/oidc/authorize/resume?request=${encodeURIComponent(oauth)}` : '/profile';

  return (
    <AuthCard
      width="lg"
      title={t('enroll.title')}
      subtitle={t('enroll.lead')}
      footer={
        !hasAccount && (
          <>
            {t('enroll.already')}{' '}
            <Link href={loginHref} className="font-medium text-frr underline-offset-4 hover:underline">
              {t('nav.login')}
            </Link>
          </>
        )
      }
    >
      {viewer.isPending ? (
        <Skeleton className="h-56 w-full" />
      ) : closed ? (
        <Notice tone="info" title={t('authUi.signupClosed')}>
          {t('authUi.signupClosedText')}
        </Notice>
      ) : (
        <>
          <Stepper current={current} done={(i) => done[i]!} />
          <ApiErrorNotice error={viewer.error} />
          {me && isStaff(me.role) && <Notice tone="caution">{t('enroll.staffNote')}</Notice>}
          <section aria-labelledby="enroll-step" className="flex flex-col gap-4">
            <h2 id="enroll-step" className="text-lg">
              <span className="text-graphite">
                {t('authUi.stepOf', { n: current + 1, total: STEPS.length })}
              </span>{' '}
              {t(STEPS[current]!)}
            </h2>
            {current === 0 && <RegisterSubjectForm />}
            {current === 1 && <ConsentForm />}
            {current === 2 && <EnrollFace />}
            {current === 3 && (
              <>
                <RegisterPasskey />
                <div className="flex flex-col gap-3 rounded-xl border border-rule bg-paper/60 p-4 sm:flex-row sm:items-center sm:justify-between">
                  <p className="text-sm text-graphite">
                    {passkeys > 0 ? t('authUi.allSet') : t('authUi.passkeyOptional')}
                  </p>
                  {/* Ссылка на сервер авторизации — полная навигация, для профиля — клиентская. */}
                  {oauth ? (
                    <a
                      href={finish}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-sheet hover:bg-ink-hover"
                      data-variant="primary"
                    >
                      {t('authUi.finish')} <ArrowRight className="size-4" aria-hidden />
                    </a>
                  ) : (
                    <Link
                      href={finish}
                      className="inline-flex h-10 shrink-0 items-center justify-center gap-2 rounded-md bg-ink px-4 text-sm font-medium text-sheet hover:bg-ink-hover"
                      data-variant="primary"
                    >
                      {t('authUi.finish')} <ArrowRight className="size-4" aria-hidden />
                    </Link>
                  )}
                </div>
              </>
            )}
          </section>
        </>
      )}
    </AuthCard>
  );
}
