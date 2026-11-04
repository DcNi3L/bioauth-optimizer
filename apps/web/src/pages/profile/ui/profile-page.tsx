'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { isStaff, ROLE_LABELS, useLogout, useViewer } from '@/entities/viewer';
import { useDeleteFace } from '@/features/capture-face';
import { useRevokeConsent } from '@/features/give-consent';
import { RegisterPasskey } from '@/features/register-passkey';
import { formatDateTime } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, Panel } from '@/shared/ui';

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="border-rule grid gap-1 border-b py-3 last:border-b-0 sm:grid-cols-[14rem_1fr]">
      <dt className="text-graphite text-sm">{label}</dt>
      <dd className="text-sm">{children}</dd>
    </div>
  );
}

/** Профиль: статус согласия, шаблона и passkey; удаление биометрии и отзыв согласия (UC-5). */
export function ProfilePage() {
  const router = useRouter();
  const viewer = useViewer();
  const logout = useLogout();
  const revoke = useRevokeConsent();
  const deleteFace = useDeleteFace();
  const me = viewer.data;

  if (viewer.isPending) return <p className="text-graphite px-6 py-10">Загрузка…</p>;
  if (!me) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <Notice tone="info" title="Вход не выполнен">
          <Link href="/login" className="underline underline-offset-4">
            Войти
          </Link>{' '}
          или{' '}
          <Link href="/enroll" className="underline underline-offset-4">
            зарегистрироваться
          </Link>
          .
        </Notice>
      </div>
    );
  }
  const staffNoMfa = isStaff(me.role) && !me.mfaComplete;
  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-4 py-10 sm:px-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl">{me.displayName}</h1>
          <p className="text-graphite">
            <span className="num">{me.login}</span> · {ROLE_LABELS[me.role]}
          </p>
        </div>
        <Button
          variant="secondary"
          busy={logout.isPending}
          onClick={() => logout.mutate(undefined, { onSuccess: () => router.push('/login') })}
        >
          Выйти
        </Button>
      </header>
      {staffNoMfa && (
        <Notice tone="caution" title="Нужен passkey">
          Для доступа к администрированию зарегистрируйте passkey — он станет вторым фактором входа.
        </Notice>
      )}
      <Panel title="Биометрия и вход">
        <dl>
          <Row label="Согласие">
            {me.consent
              ? `дано ${formatDateTime(me.consent.grantedAt)} (редакция ${me.consent.textVersion})`
              : 'не дано'}
          </Row>
          <Row label="Шаблон лица">
            {me.face
              ? `зарегистрирован ${formatDateTime(me.face.updatedAt)}, кадров: ${me.face.samples}`
              : 'нет'}
            {me.face && (
              <span className="text-graphite block text-xs">
                модель {me.face.modelVersion}; хранится зашифрованным
              </span>
            )}
          </Row>
          <Row label="Passkey">{me.passkeys > 0 ? `зарегистрировано: ${me.passkeys}` : 'нет'}</Row>
          <Row label="Двухфакторный вход">{me.mfaComplete ? 'выполнен' : 'не выполнен'}</Row>
        </dl>
      </Panel>
      <Panel title="Passkey">
        <RegisterPasskey />
      </Panel>
      {me.role === 'subject' && (
        <Panel
          title="Управление данными"
          description="Удаление выполняется сразу и фиксируется в журнале аудита."
        >
          <div className="flex flex-col gap-3">
            <ApiErrorNotice error={revoke.error ?? deleteFace.error} />
            {revoke.isSuccess && (
              <Notice tone="success">
                Согласие отозвано: шаблон и passkey удалены, статистика обезличена.
              </Notice>
            )}
            <div className="flex flex-wrap gap-2">
              {!me.face && me.consent && (
                <Link
                  href="/enroll"
                  className="bg-ink text-sheet inline-flex h-10 items-center rounded-md px-4 text-sm font-medium"
                >
                  Зарегистрировать лицо
                </Link>
              )}
              <Button
                variant="secondary"
                disabled={!me.face}
                busy={deleteFace.isPending}
                onClick={() => deleteFace.mutate()}
              >
                Удалить шаблон лица
              </Button>
              <Button
                variant="secondary"
                disabled={!me.consent}
                busy={revoke.isPending}
                onClick={() => revoke.mutate()}
              >
                Отозвать согласие и удалить биометрию
              </Button>
            </div>
          </div>
        </Panel>
      )}
    </div>
  );
}
