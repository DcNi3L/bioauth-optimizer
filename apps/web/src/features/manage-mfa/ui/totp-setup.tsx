'use client';

import QRCode from 'qrcode';
import { useEffect, useState } from 'react';

import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, CodeField } from '@/shared/ui';

import { useTotpConfirm } from '../api/mfa';

/** QR строится в браузере: секрет не отправляется сторонним сервисам. */
export function TotpSetup({
  secret,
  uri,
  onDone,
  onCancel,
}: {
  secret: string;
  uri: string;
  onDone: (recoveryCodes: string[]) => void;
  onCancel: () => void;
}) {
  const t = useT();
  const confirm = useTotpConfirm();
  const [qr, setQr] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    let alive = true;
    QRCode.toDataURL(uri, { margin: 1, width: 192, errorCorrectionLevel: 'M' })
      .then((d) => alive && setQr(d))
      .catch(() => alive && setQr(null));
    return () => {
      alive = false;
    };
  }, [uri]);

  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        confirm.mutate(code, { onSuccess: (r) => onDone(r.recoveryCodes) });
      }}
    >
      <p className="text-sm">{t('mfa.scan')}</p>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
        {qr ? (
          // data: URL, генерируется локально; next/image здесь не нужен
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={qr}
            alt={t('mfa.qrAlt')}
            width={192}
            height={192}
            className="rounded-md border border-rule bg-white"
          />
        ) : (
          <div className="h-48 w-48 animate-pulse rounded-md border border-rule bg-sheet" aria-hidden />
        )}
        <details className="text-sm">
          <summary className="cursor-pointer text-frr">{t('mfa.manual')}</summary>
          <code className="num mt-2 block rounded-md border border-rule bg-sheet p-3 text-[13px] break-all select-all">
            {secret.match(/.{1,4}/g)?.join(' ')}
          </code>
        </details>
      </div>
      <p className="text-sm">{t('mfa.enterCode')}</p>
      <CodeField
        label={t('mfa.codeLabel')}
        hint={t('mfa.codeHint')}
        value={code}
        onChange={setCode}
        focusOnMount
      />
      <ApiErrorNotice error={confirm.error} />
      <div className="flex gap-2">
        <Button type="submit" busy={confirm.isPending} disabled={code.length !== 6}>
          {t('mfa.confirm')}
        </Button>
        <Button type="button" variant="ghost" onClick={onCancel}>
          {t('mfa.cancel')}
        </Button>
      </div>
    </form>
  );
}
