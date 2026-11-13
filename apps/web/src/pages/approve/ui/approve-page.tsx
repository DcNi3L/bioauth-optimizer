'use client';

import { useSearchParams } from 'next/navigation';

import { ApproveRequest } from '@/features/cross-device';
import { useT } from '@/shared/i18n';
import { useBrowserValue } from '@/shared/lib/browser';
import { Notice, Panel } from '@/shared/ui';

const subscribeHash = (cb: () => void) => {
  window.addEventListener('hashchange', cb);
  return () => window.removeEventListener('hashchange', cb);
};

/** Подтверждение входа на другом устройстве (#40). Ключ — во фрагменте адреса, на сервер он не уходит. */
export function ApprovePage() {
  const t = useT();
  const params = useSearchParams();
  const id = params?.get('r') ?? null;
  // Ключ — во фрагменте адреса: он есть только в браузере (null — ещё не прочитан).
  const key = useBrowserValue<string | null>(
    () => new URLSearchParams(window.location.hash.slice(1)).get('k') ?? '',
    null,
    subscribeHash,
  );
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-8 sm:px-6 sm:py-10">
      <header className="flex flex-col gap-2">
        <h1 className="text-3xl">{t('crossDevice.approveTitle')}</h1>
        <p className="text-graphite">{t('crossDevice.approveIntro')}</p>
      </header>
      <Panel>
        {key === null ? null : id && key ? (
          <ApproveRequest requestId={id} approveKey={key} />
        ) : (
          <Notice tone="caution">{t('crossDevice.badLink')}</Notice>
        )}
      </Panel>
    </div>
  );
}
