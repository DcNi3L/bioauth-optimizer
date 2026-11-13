'use client';

import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Badge, Button, CodeField, Dialog, Skeleton } from '@/shared/ui';

import { useMfaStatus, useRegenerateRecovery, useTotpDisable, useTotpSetup } from '../api/mfa';
import { RecoveryCodes } from './recovery-codes';
import { TotpSetup } from './totp-setup';

type View =
  { kind: 'idle' } | { kind: 'setup'; secret: string; uri: string } | { kind: 'codes'; codes: string[] };

/** Состояние TOTP и кодов восстановления: включить, отключить, выпустить новые. */
export function MfaPanel() {
  const t = useT();
  const status = useMfaStatus();
  const setup = useTotpSetup();
  const [view, setView] = useState<View>({ kind: 'idle' });
  const [dialog, setDialog] = useState<'disable' | 'regenerate' | null>(null);

  if (status.isPending) return <Skeleton className="h-24 w-full" />;
  if (!status.data) return <ApiErrorNotice error={status.error} />;
  const { totp, recoveryCodesLeft } = status.data;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {t('mfa.title')}
            <Badge tone={totp.enabled ? 'optimum' : 'neutral'} dot>
              {totp.enabled ? t('mfa.on') : t('mfa.off')}
            </Badge>
          </span>
          {totp.confirmedAt && (
            <span className="text-xs text-graphite">
              {t('mfa.since', { date: new Date(totp.confirmedAt).toLocaleDateString() })}
            </span>
          )}
        </div>
        {view.kind === 'idle' &&
          (totp.enabled ? (
            <Button variant="danger" size="sm" onClick={() => setDialog('disable')}>
              {t('mfa.disable')}
            </Button>
          ) : (
            <Button
              size="sm"
              busy={setup.isPending}
              onClick={() =>
                setup.mutate(undefined, {
                  onSuccess: (r) => setView({ kind: 'setup', secret: r.secret, uri: r.otpauthUri }),
                })
              }
            >
              {t('mfa.enable')}
            </Button>
          ))}
      </div>
      <ApiErrorNotice error={setup.error} />

      {view.kind === 'setup' && (
        <TotpSetup
          secret={view.secret}
          uri={view.uri}
          onCancel={() => setView({ kind: 'idle' })}
          onDone={(codes) => setView({ kind: 'codes', codes })}
        />
      )}
      {view.kind === 'codes' && (
        <RecoveryCodes codes={view.codes} onSaved={() => setView({ kind: 'idle' })} />
      )}

      {totp.enabled && view.kind === 'idle' && (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule pt-4">
          <div className="flex flex-col gap-1">
            <span className="text-sm font-medium">{t('mfa.recoveryTitle')}</span>
            <span className="max-w-prose text-xs text-graphite">{t('mfa.recoveryDesc')}</span>
            <span className={`text-xs ${recoveryCodesLeft <= 2 ? 'text-caution' : 'text-graphite'}`}>
              {t('mfa.recoveryLeft', { n: recoveryCodesLeft })}
              {recoveryCodesLeft <= 2 && ` · ${t('mfa.recoveryLow')}`}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={() => setDialog('regenerate')}>
            {t('mfa.regenerate')}
          </Button>
        </div>
      )}

      <CodeDialog
        open={dialog === 'disable'}
        title={t('mfa.disableTitle')}
        text={t('mfa.disableText')}
        action={t('mfa.disable')}
        danger
        useAction={useTotpDisable}
        onClose={() => setDialog(null)}
        onDone={() => setDialog(null)}
      />
      <CodeDialog
        open={dialog === 'regenerate'}
        title={t('mfa.regenerate')}
        text={t('mfa.regenerateText')}
        action={t('mfa.regenerate')}
        useAction={useRegenerateRecovery}
        onClose={() => setDialog(null)}
        onDone={(r) => {
          setDialog(null);
          const codes = (r as { recoveryCodes?: string[] } | undefined)?.recoveryCodes;
          if (codes) setView({ kind: 'codes', codes });
        }}
      />
    </div>
  );
}

/** Диалог «введите код из приложения» для опасных действий: отключение и перевыпуск кодов. */
function CodeDialog({
  open,
  title,
  text,
  action,
  danger,
  useAction,
  onClose,
  onDone,
}: {
  open: boolean;
  title: string;
  text: string;
  action: string;
  danger?: boolean;
  useAction: () => {
    mutate: (code: string, o: { onSuccess: (r: unknown) => void }) => void;
    isPending: boolean;
    error: unknown;
    reset: () => void;
  };
  onClose: () => void;
  onDone: (result: unknown) => void;
}) {
  const t = useT();
  const m = useAction();
  const [code, setCode] = useState('');
  const close = () => {
    setCode('');
    m.reset();
    onClose();
  };
  return (
    <Dialog open={open} onClose={close} title={title} description={text} size="sm">
      <form
        className="flex flex-col gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          m.mutate(code, {
            onSuccess: (r) => {
              setCode('');
              onDone(r);
            },
          });
        }}
      >
        <CodeField
          label={t('mfa.codeLabel')}
          hint={t('mfa.codeHint')}
          value={code}
          onChange={setCode}
          focusOnMount
        />
        <ApiErrorNotice error={m.error} />
        <div className="flex gap-2">
          <Button
            type="submit"
            variant={danger ? 'danger' : 'primary'}
            busy={m.isPending}
            disabled={code.length !== 6}
          >
            {action}
          </Button>
          <Button type="button" variant="ghost" onClick={close}>
            {t('mfa.cancel')}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
