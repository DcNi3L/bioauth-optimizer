'use client';

import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Button, Checkbox } from '@/shared/ui';

import { useConsentText, useGrantConsent } from '../api/consent';

/** Согласие на обработку биометрии (UC-1): текст текущей версии и явное подтверждение. */
export function ConsentForm({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const text = useConsentText();
  const grant = useGrantConsent();
  const [accepted, setAccepted] = useState(false);
  if (text.isPending) return <p className="text-sm text-graphite">{t('enroll.consentLoading')}</p>;
  if (text.error) return <ApiErrorNotice error={text.error} />;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base">{text.data.title}</h3>
      <div className="max-h-72 overflow-y-auto rounded-md border border-rule bg-paper px-4 py-3 text-sm leading-relaxed">
        {text.data.text.split('\n\n').map((p) => (
          <p key={p.slice(0, 32)} className="mb-2 last:mb-0">
            {p}
          </p>
        ))}
        <p className="mt-3 text-xs text-graphite">{t('enroll.consentVersion', { v: text.data.version })}</p>
      </div>
      <Checkbox
        label={t('enroll.consentCheck')}
        checked={accepted}
        onChange={(e) => setAccepted(e.target.checked)}
      />
      <ApiErrorNotice error={grant.error} />
      <div>
        <Button
          disabled={!accepted}
          busy={grant.isPending}
          onClick={() => grant.mutate(text.data.version, { onSuccess: onDone })}
        >
          {t('enroll.consentGive')}
        </Button>
      </div>
    </div>
  );
}
