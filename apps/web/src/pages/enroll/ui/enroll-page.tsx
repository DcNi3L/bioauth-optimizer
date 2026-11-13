'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { isStaff, useViewer } from '@/entities/viewer';
import { EnrollFace } from '@/features/capture-face';
import { ConsentForm } from '@/features/give-consent';
import { RegisterPasskey } from '@/features/register-passkey';
import { RegisterSubjectForm } from '@/features/register-subject';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Notice, Panel } from '@/shared/ui';

function Step({
  n,
  title,
  done,
  active,
  children,
}: {
  n: number;
  title: string;
  done: boolean;
  active: boolean;
  children: ReactNode;
}) {
  const t = useT();
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          <span
            className={`num inline-flex size-7 items-center justify-center rounded-full text-sm ${done ? 'bg-optimum text-sheet' : active ? 'bg-ink text-sheet' : 'border border-rule text-graphite'}`}
            aria-hidden
          >
            {done ? '✓' : n}
          </span>
          {title}
          {done && <span className="sr-only">{t('enroll.completed')}</span>}
        </span>
      }
    >
      {active ? (
        children
      ) : (
        <p className="text-sm text-graphite">{done ? t('enroll.stepDone') : t('enroll.stepLocked')}</p>
      )}
    </Panel>
  );
}

/** Регистрация субъекта (UC-1–UC-3): учётная запись → согласие → лицо → passkey. */
export function EnrollPage() {
  const t = useT();
  const viewer = useViewer();
  const me = viewer.data ?? null;
  const hasAccount = me !== null;
  const hasConsent = !!me?.consent;
  const hasFace = !!me?.face;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">{t('enroll.title')}</h1>
        <p className="text-graphite">{t('enroll.lead')}</p>
      </header>
      <ApiErrorNotice error={viewer.error} />
      {me && isStaff(me.role) && <Notice tone="caution">{t('enroll.staffNote')}</Notice>}
      <Step n={1} title={t('enroll.stepAccount')} done={hasAccount} active={!hasAccount && !viewer.isPending}>
        <RegisterSubjectForm />
        <p className="mt-3 text-sm text-graphite">
          {t('enroll.already')}{' '}
          <Link href="/login" className="text-frr underline underline-offset-4">
            {t('nav.login')}
          </Link>
        </p>
      </Step>
      <Step n={2} title={t('enroll.stepConsent')} done={hasConsent} active={hasAccount && !hasConsent}>
        <ConsentForm />
      </Step>
      <Step n={3} title={t('enroll.stepFace')} done={hasFace} active={hasConsent && !hasFace}>
        <EnrollFace />
      </Step>
      <Step n={4} title={t('enroll.stepPasskey')} done={(me?.passkeys ?? 0) > 0} active={hasFace}>
        <RegisterPasskey />
        <p className="mt-4 text-sm text-graphite">
          {t('enroll.doneTo')}{' '}
          <Link href="/profile" className="text-frr underline underline-offset-4">
            {t('nav.profile')}
          </Link>{' '}
          ·{' '}
          <Link href="/login" className="text-frr underline underline-offset-4">
            {t('nav.login')}
          </Link>
        </p>
      </Step>
    </div>
  );
}
