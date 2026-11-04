'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { isStaff, useViewer } from '@/entities/viewer';

const LINKS = [
  { href: '/threshold', label: 'Порог' },
  { href: '/factors', label: 'Состав факторов' },
  { href: '/experiments', label: 'История' },
  { href: '/enroll', label: 'Регистрация' },
] as const;

const ADMIN_LINK = { href: '/admin', label: 'Администрирование' } as const;

export function AppNav() {
  const pathname = usePathname() ?? '';
  const viewer = useViewer().data;
  const links = viewer && isStaff(viewer.role) ? [...LINKS, ADMIN_LINK] : LINKS;
  return (
    <header className="border-rule bg-sheet border-b">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-8 gap-y-1 px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-baseline gap-2">
          <span className="font-serif text-lg font-semibold">BioAuth Optimizer</span>
          <span className="text-graphite hidden text-sm md:inline">
            оптимизация биометрической аутентификации
          </span>
        </Link>
        <nav aria-label="Разделы" className="-mx-1 flex w-full flex-1 gap-1 overflow-x-auto sm:w-auto">
          {links.map((l) => {
            const active = pathname === l.href || pathname.startsWith(`${l.href}/`);
            return (
              <Link
                key={l.href}
                href={l.href}
                aria-current={active ? 'page' : undefined}
                className={`shrink-0 rounded-md px-3 py-1.5 text-sm ${active ? 'bg-paper text-ink font-medium' : 'text-graphite hover:text-ink'}`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <Link
          href={viewer ? '/profile' : '/login'}
          className="text-graphite hover:text-ink text-sm"
          aria-current={pathname === '/profile' || pathname === '/login' ? 'page' : undefined}
        >
          {viewer ? viewer.login : 'Вход'}
        </Link>
        <a
          href={process.env.NEXT_PUBLIC_SWAGGER_URL ?? 'http://localhost:4000/api/docs'}
          target="_blank"
          rel="noreferrer"
          className="text-graphite hover:text-ink hidden text-sm sm:inline"
        >
          API (Swagger)
        </a>
      </div>
    </header>
  );
}
