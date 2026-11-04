'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

import { isStaff, useViewer } from '@/entities/viewer';
import { EnrollFace } from '@/features/capture-face';
import { ConsentForm } from '@/features/give-consent';
import { RegisterPasskey } from '@/features/register-passkey';
import { RegisterSubjectForm } from '@/features/register-subject';
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
  return (
    <Panel
      title={
        <span className="flex items-center gap-3">
          <span
            className={`num inline-flex size-7 items-center justify-center rounded-full text-sm ${done ? 'bg-optimum text-sheet' : active ? 'bg-ink text-sheet' : 'border-rule text-graphite border'}`}
            aria-hidden
          >
            {done ? '✓' : n}
          </span>
          {title}
          {done && <span className="sr-only">(выполнено)</span>}
        </span>
      }
    >
      {active ? (
        children
      ) : (
        <p className="text-graphite text-sm">{done ? 'Готово.' : 'Будет доступно после предыдущего шага.'}</p>
      )}
    </Panel>
  );
}

/** Регистрация субъекта (UC-1–UC-3): учётная запись → согласие → лицо → passkey. */
export function EnrollPage() {
  const viewer = useViewer();
  const me = viewer.data ?? null;
  const hasAccount = me !== null;
  const hasConsent = !!me?.consent;
  const hasFace = !!me?.face;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">Регистрация биометрии</h1>
        <p className="text-graphite">
          Четыре шага: учётная запись, согласие на обработку данных, снимок лица и, по желанию, passkey —
          отпечаток пальца или Face ID на вашем устройстве.
        </p>
      </header>
      <ApiErrorNotice error={viewer.error} />
      {me && isStaff(me.role) && (
        <Notice tone="caution">
          Вы вошли как сотрудник. Регистрация биометрии предназначена для субъектов.
        </Notice>
      )}
      <Step n={1} title="Учётная запись" done={hasAccount} active={!hasAccount && !viewer.isPending}>
        <RegisterSubjectForm />
        <p className="text-graphite mt-3 text-sm">
          Уже зарегистрированы?{' '}
          <Link href="/login" className="text-frr underline underline-offset-4">
            Войти
          </Link>
        </p>
      </Step>
      <Step
        n={2}
        title="Согласие на обработку биометрических данных"
        done={hasConsent}
        active={hasAccount && !hasConsent}
      >
        <ConsentForm />
      </Step>
      <Step n={3} title="Снимок лица" done={hasFace} active={hasConsent && !hasFace}>
        <EnrollFace />
      </Step>
      <Step n={4} title="Passkey (по желанию)" done={(me?.passkeys ?? 0) > 0} active={hasFace}>
        <RegisterPasskey />
        <p className="text-graphite mt-4 text-sm">
          Готово? Перейдите в{' '}
          <Link href="/profile" className="text-frr underline underline-offset-4">
            профиль
          </Link>{' '}
          или проверьте{' '}
          <Link href="/login" className="text-frr underline underline-offset-4">
            вход
          </Link>
          .
        </p>
      </Step>
    </div>
  );
}
