'use client';

import { useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';

import { ApproveRequest } from '@/features/cross-device';
import { useT } from '@/shared/i18n';
import { Notice, Panel } from '@/shared/ui';

/** Подтверждение входа на другом устройстве (#40). Ключ — во фрагменте адреса, на сервер он не уходит. */
export function ApprovePage() {
  const t = useT();
  const params = useSearchParams();
  const id = params?.get('r') ?? null;
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    const k = new URLSearchParams(window.location.hash.slice(1)).get('k');
    setKey(k ?? '');
  }, []);
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
