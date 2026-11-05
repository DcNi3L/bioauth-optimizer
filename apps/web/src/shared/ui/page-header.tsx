import type { ReactNode } from 'react';

/** Заголовок страницы: необязательная надпись над ним, описание и действия справа. */
export function PageHeader({
  title,
  description,
  actions,
  eyebrow,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="max-w-3xl">
        {eyebrow && (
          <p className="text-graphite mb-1 text-xs font-medium uppercase tracking-wide">{eyebrow}</p>
        )}
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description && <p className="text-graphite mt-2 text-[15px]">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
