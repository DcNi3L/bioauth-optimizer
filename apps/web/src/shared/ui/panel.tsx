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
    <section className={`rounded-lg border border-rule bg-sheet ${className}`}>
      {(title || actions) && (
        <header className="flex flex-wrap items-start justify-between gap-3 border-b border-rule px-5 py-4">
          <div className="max-w-prose">
            {title && <h2 className="text-lg">{title}</h2>}
            {description && <p className="mt-1 text-sm text-graphite">{description}</p>}
          </div>
          {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
        </header>
      )}
      <div className="px-5 py-4">{children}</div>
    </section>
  );
}
