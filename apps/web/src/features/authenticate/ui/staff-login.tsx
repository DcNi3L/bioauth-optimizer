'use client';

import { useState } from 'react';

import { useRefreshViewer } from '@/entities/viewer';
import { ApiErrorNotice, Button, Notice, TextField } from '@/shared/ui';

import { staffLogin, staffPasskey } from '../api/auth';

/** Вход сотрудника: пароль, затем passkey (если зарегистрирован); без passkey — предложение зарегистрировать. */
export function StaffLogin({ onSuccess }: { onSuccess?: (needsPasskey: boolean) => void }) {
  const refresh = useRefreshViewer();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'password' | 'passkey'>('password');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submitPassword() {
    setBusy(true);
    setError(null);
    try {
      const r = await staffLogin(login.trim(), password);
      await refresh();
      if (r.mfaRequired && r.passkeys > 0) setStep('passkey');
      else onSuccess?.(r.mfaRequired);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function confirmPasskey() {
    setBusy(true);
    setError(null);
    try {
      await staffPasskey();
      await refresh();
      onSuccess?.(false);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:max-w-sm">
      {step === 'password' ? (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void submitPassword();
          }}
        >
          <TextField
            label="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
          />
          <TextField
            label="Пароль"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div>
            <Button type="submit" busy={busy}>
              Войти
            </Button>
          </div>
        </form>
      ) : (
        <>
          <Notice tone="info">Пароль принят. Подтвердите вход passkey.</Notice>
          <div>
            <Button onClick={() => void confirmPasskey()} busy={busy}>
              Подтвердить passkey
            </Button>
          </div>
        </>
      )}
      <ApiErrorNotice error={error} />
    </div>
  );
}
