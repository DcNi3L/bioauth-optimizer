'use client';

import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
import { useEffect, useState } from 'react';

import { ApiErrorNotice, Button, Notice } from '@/shared/ui';

import { useRegisterPasskey } from '../api/passkey';

/** Кнопка регистрации passkey: отпечаток проверяет само устройство (Touch ID, Windows Hello), сервер его не видит. */
export function RegisterPasskey({ onDone }: { onDone?: () => void }) {
  const register = useRegisterPasskey();
  const [supported, setSupported] = useState(true);
  useEffect(() => setSupported(browserSupportsWebAuthn()), []);

  if (!supported) {
    return (
      <Notice tone="caution">
        Этот браузер не поддерживает passkey (WebAuthn). Вход будет возможен только по лицу.
      </Notice>
    );
  }
  const cancelled = register.error instanceof Error && register.error.name === 'NotAllowedError';
  return (
    <div className="flex flex-col gap-3">
      {cancelled ? (
        <Notice tone="caution">Регистрация отменена на устройстве. Попробуйте ещё раз.</Notice>
      ) : (
        <ApiErrorNotice error={register.error} />
      )}
      {register.isSuccess && <Notice tone="success">Passkey зарегистрирован.</Notice>}
      <div>
        <Button
          variant={register.isSuccess ? 'secondary' : 'primary'}
          busy={register.isPending}
          onClick={() => register.mutate(undefined, { onSuccess: onDone })}
        >
          {register.isSuccess ? 'Добавить ещё passkey' : 'Зарегистрировать passkey'}
        </Button>
      </div>
    </div>
  );
}
