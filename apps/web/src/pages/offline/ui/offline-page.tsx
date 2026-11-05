'use client';

import { WifiOff } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';

/** Показывается service worker'ом, когда сети нет и страницы нет в кэше. */
export function OfflinePage() {
  const t = useT();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 px-4 py-20 text-center">
      <span className="bg-paper text-graphite border-rule rounded-full border p-4">
        <WifiOff className="size-8" aria-hidden />
      </span>
      <h1 className="text-2xl">{t('pwa.offlineTitle')}</h1>
      <p className="text-graphite">{t('pwa.offlineText')}</p>
      <Button onClick={() => window.location.reload()}>{t('common.retry')}</Button>
    </div>
  );
}
