'use client';

import { Check, Copy, Download, Printer } from 'lucide-react';
import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { Button, Notice } from '@/shared/ui';

/** Одноразовый показ кодов: копирование, файл .txt, печать. Закрыть можно только после подтверждения. */
export function RecoveryCodes({ codes, onSaved }: { codes: string[]; onSaved: () => void }) {
  const t = useT();
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // буфер обмена недоступен (нет разрешения или небезопасный контекст) — остаются «Скачать» и «Печать»
    }
  }

  function download() {
    const body = `${t('mfa.fileHeader')}\n${t('mfa.fileNote')}\n\n${text}\n`;
    const url = URL.createObjectURL(new Blob([body], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'bioauth-recovery-codes.txt';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="recovery-print flex flex-col gap-4">
      <Notice tone="caution">{t('mfa.saveNow')}</Notice>
      <ul className="num grid grid-cols-1 gap-x-6 gap-y-1 rounded-md border border-rule bg-sheet p-4 text-[15px] tracking-wider min-[420px]:grid-cols-2">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2 print:hidden">
        <Button variant="secondary" onClick={() => void copy()}>
          {copied ? <Check size={16} aria-hidden /> : <Copy size={16} aria-hidden />}
          {copied ? t('mfa.copied') : t('mfa.copy')}
        </Button>
        <Button variant="secondary" onClick={download}>
          <Download size={16} aria-hidden />
          {t('mfa.download')}
        </Button>
        <Button variant="secondary" onClick={() => window.print()}>
          <Printer size={16} aria-hidden />
          {t('mfa.print')}
        </Button>
        <Button onClick={onSaved}>{t('mfa.saved')}</Button>
      </div>
    </div>
  );
}
