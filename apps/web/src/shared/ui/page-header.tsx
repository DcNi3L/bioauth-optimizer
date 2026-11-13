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
          <p className="mb-1 text-xs font-medium tracking-wide text-graphite uppercase">{eyebrow}</p>
        )}
        <h1 className="text-2xl sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-[15px] text-graphite">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}
