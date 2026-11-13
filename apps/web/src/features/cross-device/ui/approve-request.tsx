'use client';

import type { CrossDeviceDetailsDto } from '@bioauth/contracts';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';

import { useViewer } from '@/entities/viewer';
import { useT } from '@/shared/i18n';
import { useFormat } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, Skeleton } from '@/shared/ui';

import { approveRequest, confirmWithPasskey, denyRequest, requestDetails } from '../api/cross-device';

type Done = 'approved' | 'denied' | null;

/** Телефон: откуда запрошен вход, выбор числа с экрана компьютера, «это не я». */
export function ApproveRequest({ requestId, approveKey }: { requestId: string; approveKey: string }) {
  const t = useT();
  const f = useFormat();
  const viewer = useViewer();
  const me = viewer.data;
  const [details, setDetails] = useState<CrossDeviceDetailsDto | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<Done>(null);

  const load = useCallback(() => {
    requestDetails(requestId, approveKey).then(setDetails).catch(setError);
  }, [requestId, approveKey]);

  useEffect(() => {
    if (me) load();
  }, [me, load]);

  async function run(fn: () => Promise<void>, after: Done) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      if (after) setDone(after);
      else load();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  if (viewer.isPending) return <Skeleton className="h-40 w-full" />;
  if (!me) {
    return (
      <Notice tone="info" title={t('crossDevice.loginFirstTitle')}>
        {t('crossDevice.loginFirst')}{' '}
        <Link href="/login" className="underline underline-offset-4">
          {t('nav.login')}
        </Link>
      </Notice>
    );
  }
  if (done) {
    return (
      <Notice tone={done === 'approved' ? 'success' : 'info'}>
        {t(done === 'approved' ? 'crossDevice.doneApproved' : 'crossDevice.doneDenied')}
      </Notice>
    );
  }
  if (!details) return error ? <ApiErrorNotice error={error} /> : <Skeleton className="h-40 w-full" />;

  return (
    <div className="flex flex-col gap-5">
      <Notice tone="caution">{t('crossDevice.warning')}</Notice>
      <dl className="grid gap-2 text-sm sm:grid-cols-[10rem_1fr]">
        <dt className="text-graphite">{t('crossDevice.device')}</dt>
        <dd className="break-words">{details.userAgent ?? '—'}</dd>
        <dt className="text-graphite">{t('crossDevice.address')}</dt>
        <dd className="num">{details.ip ?? '—'}</dd>
        <dt className="text-graphite">{t('crossDevice.requested')}</dt>
        <dd>{f.dateTime(details.createdAt)}</dd>
      </dl>
      {details.needsReauth ? (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t('crossDevice.reauth')}</p>
          {me.passkeys > 0 ? (
            <div>
              <Button busy={busy} onClick={() => void run(confirmWithPasskey, null)}>
                {t('auth.passkeyConfirm')}
              </Button>
            </div>
          ) : (
            <p className="text-graphite text-sm">{t('crossDevice.reauthLogin')}</p>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium">{t('crossDevice.pick')}</p>
          <div className="grid grid-cols-3 gap-3">
            {details.choices.map((n) => (
              <button
                key={n}
                type="button"
                disabled={busy}
                onClick={() => void run(() => approveRequest(requestId, approveKey, n), 'approved')}
                className="border-rule bg-sheet hover:border-ink focus-visible:ring-frr num min-h-16 rounded-xl border font-serif text-3xl transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-60"
              >
                {n}
              </button>
            ))}
          </div>
        </div>
      )}
      <ApiErrorNotice error={error} />
      <div>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => void run(() => denyRequest(requestId, approveKey), 'denied')}
        >
          {t('crossDevice.deny')}
        </Button>
      </div>
    </div>
  );
}
