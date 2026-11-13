'use client';

import { X } from 'lucide-react';
import { type ReactNode, useEffect, useRef } from 'react';

import { useT } from '../i18n';

/**
 * Модальное окно на нативном <dialog>: фокус, Esc и инертность фона даёт браузер.
 * На телефоне — лист снизу во всю ширину, на компьютере — по центру.
 */
export function Dialog({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = 'md',
  closeLabel,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  description?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'sm' | 'md' | 'lg';
  closeLabel?: string;
}) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];
  return (
    // Щелчок по затемнению (сам <dialog> вне содержимого) закрывает окно; с клавиатуры закрывает Esc.
    // eslint-disable-next-line jsx-a11y/click-events-have-key-events, jsx-a11y/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      onClose={onClose}
      // Щелчок по затемнению (сам <dialog> вне содержимого) закрывает окно; с клавиатуры — Esc.

      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className={`m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl border border-rule bg-sheet p-0 text-ink shadow-2xl backdrop:bg-overlay sm:m-auto sm:rounded-xl ${width}`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="flex items-start justify-between gap-4 border-b border-rule px-5 py-4">
            <div>
              <h2 className="text-lg">{title}</h2>
              {description && <p className="mt-1 text-sm text-graphite">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel ?? t('common.close')}
              className="-mr-1 rounded-md p-1.5 text-graphite hover:bg-hover hover:text-ink"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="flex flex-wrap justify-end gap-2 border-t border-rule bg-paper/60 px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
