'use client';

import { WifiOff } from 'lucide-react';

import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';
import { AuthCard } from '@/widgets/auth-shell';

/** Показывается service worker'ом, когда сети нет и страницы нет в кэше. */
export function OfflinePage() {
  const t = useT();
  return (
    <AuthCard
      width="sm"
      title={t('pwa.offlineTitle')}
      subtitle={t('pwa.offlineText')}
      icon={
        <span className="rounded-full border border-rule bg-paper p-4 text-graphite">
          <WifiOff className="size-8" aria-hidden />
        </span>
      }
    >
      <Button className="w-full" onClick={() => window.location.reload()}>
        {t('common.retry')}
      </Button>
    </AuthCard>
  );
}
