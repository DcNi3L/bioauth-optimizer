'use client';

import { Download, ExternalLink } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { type FocusEvent, type MouseEvent, useState } from 'react';

import { useT } from '@/shared/i18n';
import { useInstallPrompt } from '@/shared/lib/pwa';
import { Logo } from '@/shared/ui';

import { isActive, type NavGroup } from '../model/nav';

const isCollapsed = () => document.documentElement.dataset.sidebar === 'collapsed';

/** Подсказка у иконки свёрнутой панели: позиция фиксирована, чтобы её не обрезала прокрутка списка. */
function useRailTooltip() {
  const [tip, setTip] = useState<{ label: string; top: number; left: number } | null>(null);
  const show = (e: MouseEvent<HTMLElement> | FocusEvent<HTMLElement>, label: string) => {
    if (!isCollapsed() || !e.currentTarget.closest('[data-rail]')) return;
    const r = e.currentTarget.getBoundingClientRect();
    setTip({ label, top: r.top + r.height / 2, left: r.right + 10 });
  };
  const hide = () => setTip(null);
  const node = tip && (
    <span
      role="tooltip"
      style={{ top: tip.top, left: tip.left }}
      className="pointer-events-none fixed z-[70] -translate-y-1/2 rounded-md bg-ink px-2.5 py-1.5 text-xs font-medium whitespace-nowrap text-sheet shadow-lg"
    >
      {tip.label}
    </span>
  );
  return { show, hide, node };
}

/**
 * Навигация. В режиме `rail` (широкий экран) панель сворачивается до иконок: подписи скрыты визуально, но
 * остаются доступным именем ссылки, а при наведении появляется подсказка.
 */
export function SidebarNav({
  groups,
  onNavigate,
  rail = false,
}: {
  groups: NavGroup[];
  onNavigate?: () => void;
  rail?: boolean;
}) {
  const t = useT();
  const pathname = usePathname() ?? '';
  const pwa = useInstallPrompt();
  const tip = useRailTooltip();
  return (
    <div className="flex h-full flex-col" data-rail={rail ? '' : undefined}>
      <Link
        href="/"
        onClick={onNavigate}
        className={`flex h-16 shrink-0 items-center gap-3 px-5 collapsed:justify-center collapsed:px-0 ${rail ? '' : 'pr-14'}`}
        onMouseEnter={(e) => tip.show(e, 'BioAuth')}
        onMouseLeave={tip.hide}
      >
        <Logo className="size-8 shrink-0" />
        <span className="flex min-w-0 flex-col leading-tight collapsed:sr-only">
          <span className="font-serif text-[17px] font-semibold">BioAuth</span>
          <span className="text-[11px] leading-snug text-graphite">{t('nav.tagline')}</span>
        </span>
      </Link>
      <nav
        aria-label={t('nav.sections')}
        className="flex-1 overflow-x-hidden overflow-y-auto px-3 pb-4 collapsed:px-2"
        onScroll={tip.hide}
      >
        {groups.map((g, gi) => (
          <div key={g.title ?? gi} className="mb-4">
            {g.title && (
              <>
                <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold tracking-wider text-graphite/80 uppercase collapsed:sr-only">
                  {t(g.title)}
                </p>
                <hr className="mx-2 mb-2 hidden border-rule collapsed:block" aria-hidden />
              </>
            )}
            <ul className="flex flex-col gap-0.5">
              {g.items.map((item) => {
                const active = isActive(pathname, item);
                const Icon = item.icon;
                const label = t(item.label);
                const cls = `group relative flex h-9 items-center gap-3 rounded-lg px-3 text-sm transition-colors collapsed:justify-center collapsed:px-0 ${
                  active ? 'bg-hover font-medium text-ink' : 'text-graphite hover:bg-hover/70 hover:text-ink'
                }`;
                const handlers = {
                  onMouseEnter: (e: MouseEvent<HTMLElement>) => tip.show(e, label),
                  onMouseLeave: tip.hide,
                  onFocus: (e: FocusEvent<HTMLElement>) => tip.show(e, label),
                  onBlur: tip.hide,
                };
                const inner = (
                  <>
                    {active && (
                      <span
                        className="absolute top-2 bottom-2 -left-3 w-1 rounded-r bg-ink collapsed:-left-2"
                        aria-hidden
                      />
                    )}
                    <Icon className={`size-[18px] shrink-0 ${active ? 'text-ink' : ''}`} aria-hidden />
                    <span className="flex-1 truncate collapsed:sr-only">{label}</span>
                    {item.external && (
                      <ExternalLink className="size-3.5 shrink-0 opacity-60 collapsed:hidden" aria-hidden />
                    )}
                  </>
                );
                return (
                  <li key={item.href}>
                    {item.external ? (
                      <a href={item.href} target="_blank" rel="noreferrer" className={cls} {...handlers}>
                        {inner}
                      </a>
                    ) : (
                      <Link
                        href={item.href}
                        onClick={() => {
                          tip.hide();
                          onNavigate?.();
                        }}
                        aria-current={active ? 'page' : undefined}
                        className={cls}
                        {...handlers}
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
      {pwa.canInstall && (
        <div className="px-3 pb-3 collapsed:px-2">
          <button
            type="button"
            onClick={() => void pwa.install()}
            onMouseEnter={(e) => tip.show(e, t('pwa.install'))}
            onMouseLeave={tip.hide}
            className="flex h-9 w-full items-center gap-3 rounded-lg border border-rule px-3 text-sm text-ink hover:bg-hover collapsed:justify-center collapsed:px-0"
          >
            <Download className="size-[18px] shrink-0 text-frr" aria-hidden />
            <span className="truncate collapsed:sr-only">{t('pwa.install')}</span>
          </button>
        </div>
      )}
      <p className="border-t border-rule px-5 py-3 text-[11px] text-graphite collapsed:px-0 collapsed:text-center">
        <span className="collapsed:sr-only">BioAuth Optimizer · </span>v3.4.0
      </p>
      {tip.node}
    </div>
  );
}
