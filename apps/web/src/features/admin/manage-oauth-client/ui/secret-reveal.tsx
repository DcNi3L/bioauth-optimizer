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
      {copied ? <Check className="size-4 text-optimum" /> : <Copy className="size-4" />}
      {copied ? t('common.copied') : (label ?? t('common.copy'))}
    </Button>
  );
}

/** Секрет клиента показывается один раз — сразу после создания или ротации. */
export function SecretReveal({ secret }: { secret: string }) {
  const t = useT();
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-caution/40 bg-caution-bg p-4" role="status">
      <p className="flex items-center gap-2 text-sm font-medium text-caution">
        <KeyRound className="size-4" /> {t('admin.clients.secretTitle')}
      </p>
      <p className="text-xs text-caution">{t('admin.clients.secretText')}</p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-md border border-rule bg-sheet px-3 py-2 font-mono text-[13px] break-all text-ink">
          {secret}
        </code>
        <CopyButton value={secret} />
      </div>
    </div>
  );
}
