'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

export interface LinkTab {
  href: string;
  label: ReactNode;
  /** Совпадение только по точному адресу (для корневой вкладки раздела). */
  exact?: boolean;
  badge?: ReactNode;
}

/** Вкладки-ссылки: активная определяется по адресу; на узком экране прокручиваются по горизонтали. */
export function LinkTabs({ items, label }: { items: readonly LinkTab[]; label: string }) {
  const pathname = usePathname() ?? '';
  return (
    <nav aria-label={label} className="border-rule -mx-4 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1">
        {items.map((t) => {
          const active = t.exact
            ? pathname === t.href
            : pathname === t.href || pathname.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link
                href={t.href}
                aria-current={active ? 'page' : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? 'border-ink text-ink font-medium'
                    : 'text-graphite hover:text-ink border-transparent'
                }`}
              >
                {t.label}
                {t.badge}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
