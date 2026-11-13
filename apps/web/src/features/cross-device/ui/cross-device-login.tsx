'use client';

import type { CrossDeviceStartDto } from '@bioauth/contracts';
import QRCode from 'qrcode';
import { useEffect, useEffectEvent, useRef, useState } from 'react';

import { useRefreshViewer } from '@/entities/viewer';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, Notice } from '@/shared/ui';

import { completeRequest, pollStatus, startRequest } from '../api/cross-device';

type State = 'idle' | 'waiting' | 'approved' | 'denied' | 'expired';

/** Компьютер: QR-код для телефона и число для сверки; после подтверждения на телефоне вход завершается сам. */
export function CrossDeviceLogin({ onSuccess }: { onSuccess?: () => void }) {
  const t = useT();
  const refresh = useRefreshViewer();
  const [req, setReq] = useState<CrossDeviceStartDto | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [state, setState] = useState<State>('idle');
  const [left, setLeft] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const finishing = useRef(false);
  // Событие эффекта: эффект опроса не перезапускается от новых колбэков на каждой отрисовке (счётчик тикает раз в секунду).
  const finish = useEffectEvent(async () => {
    await refresh();
    onSuccess?.();
  });

  async function begin() {
    setBusy(true);
    setError(null);
    try {
      const r = await startRequest();
      setReq(r);
      setState('waiting');
      finishing.current = false;
      setQr(await QRCode.toDataURL(r.approveUrl, { margin: 1, width: 224, errorCorrectionLevel: 'M' }));
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    if (!req || state !== 'waiting') return;
    const tick = () => setLeft(Math.max(0, Math.round((Date.parse(req.expiresAt) - Date.now()) / 1000)));
    tick();
    const clock = setInterval(tick, 1000);
    const poll = setInterval(() => {
      pollStatus(req.requestId, req.pollSecret)
        .then(async (s) => {
          if (s.status === 'approved' && !finishing.current) {
            finishing.current = true;
            setState('approved');
            await completeRequest(req.requestId, req.pollSecret);
            await finish();
          } else if (s.status === 'denied' || s.status === 'expired') {
            setState(s.status);
          }
        })
        .catch(setError);
    }, 2000);
    return () => {
      clearInterval(clock);
      clearInterval(poll);
    };
  }, [req, state]);

  if (state === 'idle') {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm">{t('crossDevice.intro')}</p>
        <ApiErrorNotice error={error} />
        <div>
          <Button busy={busy} onClick={() => void begin()}>
            {t('crossDevice.show')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {state === 'waiting' && req && (
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:items-start">
          {qr ? (
            // data:-URL QR-кода строится в браузере; next/image для него не нужен.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={qr}
              alt={t('crossDevice.qrAlt')}
              width={224}
              height={224}
              className="rounded-lg bg-white p-2"
            />
          ) : (
            <div className="size-56 rounded-lg bg-paper" />
          )}
          <div className="flex flex-col gap-3">
            <p className="text-sm">{t('crossDevice.scan')}</p>
            <div>
              <p className="text-xs text-graphite">{t('crossDevice.numberLabel')}</p>
              <p className="num font-serif text-5xl" aria-live="polite">
                {req.number}
              </p>
            </div>
            <p className="text-xs text-graphite" aria-live="off">
              {t('crossDevice.expires', { s: left })}
            </p>
            <p className="text-xs text-graphite">{t('crossDevice.waiting')}</p>
          </div>
        </div>
      )}
      {state === 'approved' && <Notice tone="success">{t('crossDevice.approved')}</Notice>}
      {(state === 'denied' || state === 'expired') && (
        <Notice tone="caution">{t(state === 'denied' ? 'crossDevice.denied' : 'crossDevice.expired')}</Notice>
      )}
      <ApiErrorNotice error={error} />
      {state !== 'approved' && (
        <div>
          <Button variant="secondary" busy={busy} onClick={() => void begin()}>
            {t('crossDevice.again')}
          </Button>
        </div>
      )}
    </div>
  );
}
