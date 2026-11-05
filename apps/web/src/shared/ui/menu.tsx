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
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
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
          className={`bg-sheet border-rule absolute top-full z-50 mt-2 min-w-52 overflow-hidden rounded-lg border p-1 shadow-xl ${
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
      className="hover:bg-hover text-ink flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-left text-sm"
    >
      {icon && <span className="text-graphite [&>svg]:size-4">{icon}</span>}
      <span className="flex-1">{children}</span>
      {selected && <span className="bg-frr size-1.5 rounded-full" aria-hidden />}
    </button>
  );
}

export function MenuSeparator() {
  return <div className="bg-rule my-1 h-px" role="separator" />;
}
