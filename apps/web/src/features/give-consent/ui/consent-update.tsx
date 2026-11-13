'use client';

import type { MeDto } from '@bioauth/contracts';
import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { Button, Notice } from '@/shared/ui';

import { ConsentForm } from './consent-form';

/** Действует старая редакция согласия (#49): предложить принять новую, не удаляя уже собранные данные. */
export function ConsentUpdate({ me }: { me: MeDto }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  if (!me.consent || me.consent.current) return null;
  return (
    <Notice tone="caution" title={t('profile.consentOutdatedTitle')}>
      <p>{t('profile.consentOutdated', { v: me.consent.textVersion })}</p>
      {open ? (
        <div className="mt-3">
          <ConsentForm onDone={() => setOpen(false)} />
        </div>
      ) : (
        <div className="mt-3">
          <Button variant="secondary" onClick={() => setOpen(true)}>
            {t('profile.consentReview')}
          </Button>
        </div>
      )}
    </Notice>
  );
}
