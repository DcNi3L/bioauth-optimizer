'use client';

import { ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import { useT } from '@/shared/i18n';

import { isActive, type NavGroup } from '../model/nav';
import { Logo } from './logo';

export function SidebarNav({ groups, onNavigate }: { groups: NavGroup[]; onNavigate?: () => void }) {
  const t = useT();
  const pathname = usePathname() ?? '';
  return (
    <div className="flex h-full flex-col">
      <Link href="/" onClick={onNavigate} className="flex items-center gap-3 px-5 pb-6 pt-5">
        <Logo />
        <span className="flex flex-col leading-tight">
          <span className="font-serif text-[17px] font-semibold">BioAuth</span>
          <span className="text-graphite text-[11px]">{t('nav.tagline')}</span>
        </span>
      </Link>
      <nav aria-label={t('nav.sections')} className="flex-1 overflow-y-auto px-3 pb-4">
        {groups.map((g, gi) => (
          <div key={g.title ?? gi} className="mb-5">
            {g.title && (
              <p className="text-graphite/80 px-3 pb-1.5 text-[11px] font-semibold uppercase tracking-wider">
                {t(g.title)}
              </p>
            )}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                const cls = `group relative flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                  active ? 'bg-hover text-ink font-medium' : 'text-graphite hover:text-ink hover:bg-hover/70'
                }`;
                const inner = (
                  <>
                    {active && (
                      <span className="bg-ink absolute -left-3 bottom-2 top-2 w-1 rounded-r" aria-hidden />
                    )}
                    <Icon className={`size-[18px] shrink-0 ${active ? 'text-ink' : ''}`} aria-hidden />
                    <span className="flex-1 truncate">{t(item.label)}</span>
                    {item.external && <ExternalLink className="size-3.5 opacity-60" aria-hidden />}
                  </>
                );
                return (
                  <li key={item.href}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noreferrer" className={cls}>
                        {inner}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={onNavigate}
                        aria-current={active ? 'page' : undefined}
                        className={cls}
                      >
                        {inner}
                      </Link>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
      <p className="text-graphite border-rule border-t px-5 py-3 text-[11px]">BioAuth Optimizer · v3.0.0</p>
    </div>
  );
}
