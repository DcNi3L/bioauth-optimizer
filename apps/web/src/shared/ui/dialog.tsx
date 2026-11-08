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
      className={`bg-sheet text-ink border-rule backdrop:bg-overlay m-0 mt-auto max-h-[92dvh] w-full max-w-none rounded-t-2xl border p-0 shadow-2xl sm:m-auto sm:rounded-xl ${width}`}
    >
      {open && (
        <div className="flex max-h-[92dvh] flex-col">
          <header className="border-rule flex items-start justify-between gap-4 border-b px-5 py-4">
            <div>
              <h2 className="text-lg">{title}</h2>
              {description && <p className="text-graphite mt-1 text-sm">{description}</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label={closeLabel ?? t('common.close')}
              className="text-graphite hover:text-ink hover:bg-hover -mr-1 rounded-md p-1.5"
            >
              <X className="size-5" />
            </button>
          </header>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && (
            <footer className="border-rule bg-paper/60 flex flex-wrap justify-end gap-2 border-t px-5 py-3">
              {footer}
            </footer>
          )}
        </div>
      )}
    </dialog>
  );
}
