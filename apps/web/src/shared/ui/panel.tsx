import type { ReactNode } from 'react';

/** Раздел рабочего места: заголовок, необязательное пояснение и действия справа. */
export function Panel({
  title,
  description,
  actions,
  children,
  className = '',
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`border-rule bg-sheet rounded-lg border ${className}`}>
      {(title !== undefined || actions !== undefined) && (
        <header className="border-rule flex flex-wrap items-start justify-between gap-3 border-b px-5 py-4">
          <div className="max-w-prose">
            {title && <h2 className="text-lg">{title}</h2>}
            {description && <p className="text-graphite mt-1 text-sm">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
