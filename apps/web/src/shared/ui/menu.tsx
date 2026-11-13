'use client';

import { type ReactNode, useEffect, useId, useRef, useState } from 'react';

/** Выпадающее меню: кнопка + список; закрывается по Esc, щелчку снаружи и выбору пункта. */
export function Menu({
  trigger,
  label,
  children,
  align = 'end',
  triggerClassName = '',
}: {
  trigger: ReactNode;
  label: string;
  children: (close: () => void) => ReactNode;
  align?: 'start' | 'end';
  triggerClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    };
    const items = () => Array.from(root.current?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? []);
    items()[0]?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        root.current?.querySelector<HTMLElement>('[aria-haspopup]')?.focus();
        return;
      }
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      const list = items();
      const i = list.indexOf(document.activeElement as HTMLElement);
      const next = e.key === 'ArrowDown' ? (i + 1) % list.length : (i - 1 + list.length) % list.length;
      list[next]?.focus();
    };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);
  return (
    <div ref={root} className="relative">
      <button
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        className={triggerClassName}
      >
        {trigger}
      </button>
      {open && (
        <div
          id={id}
          role="menu"
          aria-label={label}
          className={`absolute top-full z-50 mt-2 min-w-52 overflow-hidden rounded-lg border border-rule bg-sheet p-1 shadow-xl ${
            align === 'end' ? 'right-0' : 'left-0'
          }`}
        >
          {children(() => setOpen(false))}
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  children,
  onSelect,
  selected,
  icon,
}: {
  children: ReactNode;
  onSelect: () => void;
  selected?: boolean;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role={selected === undefined ? 'menuitem' : 'menuitemradio'}
      aria-checked={selected}
      onClick={onSelect}
      className="flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm text-ink hover:bg-hover"
    >
      {icon && <span className="text-graphite [&>svg]:size-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {selected && <span className="size-1.5 rounded-full bg-frr" aria-hidden />}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="my-1 h-px bg-rule" role="separator" />;
}
