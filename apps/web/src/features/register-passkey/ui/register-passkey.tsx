'use client';

import { browserSupportsWebAuthn } from '@simplewebauthn/browser';

import { useT } from '@/shared/i18n';
import { useBrowserValue } from '@/shared/lib/browser';
import { ApiErrorNotice, Button, Notice } from '@/shared/ui';

import { useRegisterPasskey } from '../api/passkey';

/** Кнопка регистрации passkey: отпечаток проверяет само устройство (Touch ID, Windows Hello), сервер его не видит. */
export function RegisterPasskey({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const register = useRegisterPasskey();
  const supported = useBrowserValue(browserSupportsWebAuthn, true);

  if (!supported) {
    return <Notice tone="caution">{t('enroll.pkUnsupported')}</Notice>;
  }
  const cancelled = register.error instanceof Error && register.error.name === 'NotAllowedError';
  return (
    <div className="flex flex-col gap-3">
      {cancelled ? (
        <Notice tone="caution">{t('enroll.pkCancelled')}</Notice>
      ) : (
        <ApiErrorNotice error={register.error} />
      )}
      {register.isSuccess && <Notice tone="success">{t('enroll.pkDone')}</Notice>}
      <div>
        <Button
          variant={register.isSuccess ? 'secondary' : 'primary'}
          busy={register.isPending}
          onClick={() => register.mutate(undefined, { onSuccess: onDone })}
        >
          {register.isSuccess ? t('enroll.pkAdd') : t('enroll.pkRegister')}
        </Button>
      </div>
    </div>
  );
}
