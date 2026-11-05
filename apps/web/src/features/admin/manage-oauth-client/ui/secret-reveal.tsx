'use client';

import { Check, Copy, KeyRound } from 'lucide-react';
import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';

export function CopyButton({ value, label }: { value: string; label?: string }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        void navigator.clipboard.writeText(value).then(() => {
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        });
      }}
    >
      {copied ? <Check className="text-optimum size-4" /> : <Copy className="size-4" />}
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </Button>
  );
}

/** Секрет клиента показывается один раз — сразу после создания или ротации. */
export function SecretReveal({ secret }: { secret: string }) {
  const t = useT();
  return (
    <div className="border-caution/40 bg-caution-bg flex flex-col gap-2 rounded-lg border p-4" role="status">
      <p className="text-caution flex items-center gap-2 text-sm font-medium">
        <KeyRound className="size-4" /> {t('admin.clients.secretTitle')}
      </p>
      <p className="text-caution text-xs">{t('admin.clients.secretText')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="bg-sheet border-rule text-ink min-w-0 flex-1 break-all rounded-md border px-3 py-2 font-mono text-[13px]">
          {secret}
        </code>
        <CopyButton value={secret} />
      </div>
    </div>
  );
}
