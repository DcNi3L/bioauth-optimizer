'use client';

import { useState } from 'react';

import { ApiErrorNotice, Button, Checkbox } from '@/shared/ui';

import { useConsentText, useGrantConsent } from '../api/consent';

/** Согласие на обработку биометрии (UC-1): текст текущей версии и явное подтверждение. */
export function ConsentForm({ onDone }: { onDone?: () => void }) {
  const text = useConsentText();
  const grant = useGrantConsent();
  const [accepted, setAccepted] = useState(false);
  if (text.isPending) return <p className="text-graphite text-sm">Загружаю текст согласия…</p>;
  if (text.error) return <ApiErrorNotice error={text.error} />;
  return (
    <div className="flex flex-col gap-4">
      <h3 className="text-base">{text.data.title}</h3>
      <div className="border-rule bg-paper max-h-72 overflow-y-auto rounded-md border px-4 py-3 text-sm leading-relaxed">
        {text.data.text.split('\n\n').map((p) => (
          <p key={p.slice(0, 32)} className="mb-2 last:mb-0">
            {p}
          </p>
        ))}
        <p className="text-graphite mt-3 text-xs">Редакция {text.data.version}</p>
      </div>
      <Checkbox
        label="Я прочитал(а) текст и даю согласие"
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
          Дать согласие
        </Button>
      </div>
    </div>
  );
}
