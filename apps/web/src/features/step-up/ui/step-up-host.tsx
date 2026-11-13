'use client';

import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';

import { useViewer, viewerKeys } from '@/entities/viewer';
import { setStepUpHandler } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, CodeField, Dialog, TextField } from '@/shared/ui';

import { confirmPasskey, confirmRecovery, confirmTotp } from '../api/step-up';

/**
 * Окно повторной проверки второго фактора (#41). Регистрируется в клиенте API: когда сервер отвечает
 * `step-up-required`, окно открывается, а после проверки исходный запрос повторяется автоматически.
 */
export function StepUpHost() {
  const t = useT();
  const qc = useQueryClient();
  const me = useViewer().data;
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [recovery, setRecovery] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(
    () =>
      setStepUpHandler(
        () =>
          new Promise<boolean>((resolve) => {
            resolver.current?.(false);
            resolver.current = resolve;
            setCode('');
            setRecovery(false);
            setError(null);
            setOpen(true);
          }),
      ),
    [],
  );

  const finish = (ok: boolean) => {
    resolver.current?.(ok);
    resolver.current = null;
    setOpen(false);
    if (ok) void qc.invalidateQueries({ queryKey: viewerKeys.me });
  };

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      finish(true);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  const passkey = (me?.passkeys ?? 0) > 0;
  const totp = !!me?.totp;
  return (
    <Dialog
      open={open}
      onClose={() => finish(false)}
      title={t('stepUp.title')}
      description={t('stepUp.desc')}
      size="sm"
    >
      <div className="flex flex-col gap-4 px-5 py-4">
        {passkey && (
          <div>
            <Button busy={busy} onClick={() => void run(confirmPasskey)}>
              {t('auth.passkeyConfirm')}
            </Button>
          </div>
        )}
        {passkey && totp && <p className="text-xs text-graphite">{t('mfa.login.or')}</p>}
        {totp && (
          <form
            className="flex flex-col gap-3"
            onSubmit={(e) => {
              e.preventDefault();
              void run(() => (recovery ? confirmRecovery(code.trim()) : confirmTotp(code)));
            }}
          >
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
                focusOnMount={!passkey}
              />
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                variant={passkey ? 'secondary' : 'primary'}
                busy={busy}
                disabled={recovery ? code.trim().length < 10 : code.length !== 6}
              >
                {t('stepUp.confirm')}
              </Button>
              <button
                type="button"
                className="text-sm text-frr underline underline-offset-4"
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
        )}
        {!passkey && !totp && <p className="text-sm">{t('stepUp.noFactor')}</p>}
        <ApiErrorNotice error={error} />
      </div>
    </Dialog>
  );
}
