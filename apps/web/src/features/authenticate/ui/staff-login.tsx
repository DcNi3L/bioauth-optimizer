'use client';

import { useState } from 'react';

import { useRefreshViewer } from '@/entities/viewer';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, CodeField, Notice, TextField } from '@/shared/ui';

import { staffLogin, staffPasskey, staffRecovery, staffTotp } from '../api/auth';

/**
 * Вход сотрудника: пароль, затем второй фактор — passkey или код из приложения-аутентификатора
 * (запасной путь — код восстановления). Без второго фактора — переход в профиль, чтобы его настроить.
 */
export function StaffLogin({ onSuccess }: { onSuccess?: (needsPasskey: boolean) => void }) {
  const t = useT();
  const refresh = useRefreshViewer();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [step, setStep] = useState<'password' | 'second'>('password');
  const [methods, setMethods] = useState({ passkey: false, totp: false });
  const [recovery, setRecovery] = useState(false);
  const [code, setCode] = useState('');
  const [left, setLeft] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  async function submitPassword() {
    setBusy(true);
    setError(null);
    try {
      const r = await staffLogin(login.trim(), password);
      await refresh();
      const m = { passkey: r.passkeys > 0, totp: r.totp };
      if (r.mfaRequired && (m.passkey || m.totp)) {
        setMethods(m);
        setStep('second');
      } else onSuccess?.(r.mfaRequired);
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

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      if (recovery) {
        const n = await staffRecovery(code.trim());
        await refresh();
        // Кодов почти не осталось — сначала предупреждаем, переход выполняет кнопка.
        if (n <= 2) setLeft(n);
        else onSuccess?.(false);
        return;
      }
      await staffTotp(code);
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
            label={t('auth.login')}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
          />
          <TextField
            label={t('auth.password')}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
          <div>
            <Button type="submit" busy={busy}>
              {t('auth.signIn')}
            </Button>
          </div>
        </form>
      ) : (
        <div className="flex flex-col gap-4">
          <Notice tone="info">{t('auth.passwordAccepted')}</Notice>
          {methods.passkey && left === null && (
            <div>
              <Button onClick={() => void confirmPasskey()} busy={busy}>
                {t('auth.passkeyConfirm')}
              </Button>
            </div>
          )}
          {methods.passkey && methods.totp && <p className="text-graphite text-xs">{t('mfa.login.or')}</p>}
          {left !== null ? (
            <div className="flex flex-col gap-3">
              <Notice tone="caution">{t('mfa.login.left', { n: left })}</Notice>
              <div>
                <Button onClick={() => onSuccess?.(false)}>{t('auth.continue')}</Button>
              </div>
            </div>
          ) : (
            methods.totp && (
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  void submitCode();
                }}
              >
                <p className="text-sm">{recovery ? t('mfa.login.recoveryHint') : t('mfa.login.app')}</p>
                {recovery ? (
                  <TextField
                    label={t('mfa.login.recoveryLabel')}
                    value={code}
                    onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 16))}
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    required
                  />
                ) : (
                  <CodeField
                    label={t('mfa.codeLabel')}
                    hint={t('mfa.codeHint')}
                    value={code}
                    onChange={setCode}
                    focusOnMount
                  />
                )}
                <div className="flex flex-wrap items-center gap-3">
                  <Button
                    type="submit"
                    busy={busy}
                    disabled={recovery ? code.trim().length < 10 : code.length !== 6}
                  >
                    {t('mfa.login.submit')}
                  </Button>
                  <button
                    type="button"
                    className="text-frr text-sm underline underline-offset-4"
                    onClick={() => {
                      setRecovery(!recovery);
                      setCode('');
                      setError(null);
                    }}
                  >
                    {recovery ? t('mfa.login.useApp') : t('mfa.login.useRecovery')}
                  </button>
                </div>
              </form>
            )
          )}
        </div>
      )}
      <ApiErrorNotice error={error} />
    </div>
  );
}
