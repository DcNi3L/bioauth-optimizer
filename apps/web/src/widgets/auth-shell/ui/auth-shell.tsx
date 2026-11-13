'use client';

import type { TenantSettingsDto } from '@bioauth/contracts';
import { KeyRound, LifeBuoy, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import type { CSSProperties, ReactNode } from 'react';

import { useTenantSettings } from '@/entities/tenant';
import { useT } from '@/shared/i18n';
import { LanguageMenu, Logo, ThemeMenu } from '@/shared/ui';

/** Текст на цвете бренда: белый или чернильный — по относительной яркости (WCAG). */
export function onColor(hex: string): string {
  const lin = (i: number) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const l = 0.2126 * lin(1) + 0.7152 * lin(3) + 0.0722 * lin(5);
  return l > 0.4 ? '#17202b' : '#ffffff';
}

export function brandStyle(accent: string | null | undefined): CSSProperties | undefined {
  return accent ? ({ '--brand-accent': accent, '--brand-on': onColor(accent) } as CSSProperties) : undefined;
}

/** Знак тенанта: логотип по https, иначе знак BioAuth. */
export function BrandMark({ settings, size = 44 }: { settings?: TenantSettingsDto; size?: number }) {
  if (settings?.logoUrl) {
    return (
      // Логотип задаёт администратор (любой https-адрес) — next/image потребовал бы список доменов.
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={settings.logoUrl}
        alt=""
        referrerPolicy="no-referrer"
        style={{ height: size, maxWidth: size * 4 }}
        className="w-auto object-contain"
      />
    );
  }
  return <Logo className="shrink-0" size={size} />;
}

/**
 * Оболочка страниц входа, регистрации и решений OAuth — как Universal Login в Auth0: без боковой и верхней
 * навигации, карточка по центру, бренд тенанта, язык и тема в углу, ссылки поддержки и политики внизу.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  const t = useT();
  const { data: settings } = useTenantSettings();
  const links = [
    settings?.supportUrl && { href: settings.supportUrl, label: t('authUi.support') },
    settings?.privacyUrl && { href: settings.privacyUrl, label: t('authUi.privacy') },
    settings?.termsUrl && { href: settings.termsUrl, label: t('authUi.terms') },
  ].filter((x): x is { href: string; label: string } => !!x);
  return (
    <div
      className="auth-backdrop flex min-h-dvh flex-col"
      data-brand-accent={settings?.accentColor ? '' : undefined}
      style={brandStyle(settings?.accentColor)}
    >
      <a
        href="#main"
        className="sr-only z-[60] rounded-md bg-ink px-3 py-2 text-sm text-sheet focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        {t('nav.skip')}
      </a>
      <header className="flex items-center justify-between gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))] sm:px-6">
        <Link
          href="/"
          className="inline-flex items-center gap-2 rounded-lg py-1 pr-2 text-sm text-graphite hover:text-ink"
          aria-label={t('authUi.home', { name: settings?.productName ?? 'BioAuth' })}
        >
          <Logo className="size-6" />
          <span className="hidden font-medium sm:inline">{settings?.productName ?? 'BioAuth'}</span>
        </Link>
        <div className="flex items-center gap-1">
          <LanguageMenu />
          <ThemeMenu />
        </div>
      </header>
      <main id="main" className="flex flex-1 flex-col items-center justify-center px-4 py-8 sm:py-10">
        {children}
      </main>
      <footer className="flex flex-col items-center gap-2 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-xs text-graphite">
        {links.length > 0 && (
          <nav
            aria-label={t('authUi.links')}
            className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1"
          >
            {links.map((l, i) => (
              <a
                key={l.href}
                href={l.href}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 hover:text-ink hover:underline"
              >
                {i === 0 && settings?.supportUrl && <LifeBuoy className="size-3.5" aria-hidden />}
                {l.label}
              </a>
            ))}
          </nav>
        )}
        <p className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <span>{t('authUi.securedBy')}</span>
          <span className="inline-flex items-center gap-1">
            <ShieldCheck className="size-3.5" aria-hidden /> ISO/IEC 30107-3 PAD
          </span>
          <span className="inline-flex items-center gap-1">
            <KeyRound className="size-3.5" aria-hidden /> FIDO2 / WebAuthn
          </span>
        </p>
      </footer>
    </div>
  );
}

const WIDTH = { sm: 'max-w-[26rem]', md: 'max-w-[30rem]', lg: 'max-w-[40rem]' } as const;

/**
 * Карточка страницы входа: знак и название тенанта, заголовок, подзаголовок, содержимое и низ карточки
 * (например, «Нет учётной записи? Зарегистрироваться»).
 */
export function AuthCard({
  title,
  subtitle,
  children,
  footer,
  width = 'md',
  brand = true,
  icon,
}: {
  title: ReactNode;
  subtitle?: ReactNode;
  children?: ReactNode;
  footer?: ReactNode;
  width?: keyof typeof WIDTH;
  brand?: boolean;
  /** Вместо знака тенанта — значок состояния (ошибка, выход, нет сети). */
  icon?: ReactNode;
}) {
  const { data: settings } = useTenantSettings();
  return (
    <section
      className={`w-full ${WIDTH[width]} overflow-hidden rounded-2xl border border-rule bg-sheet shadow-[0_1px_2px_rgb(0_0_0/0.04),0_12px_32px_-12px_rgb(0_0_0/0.18)]`}
    >
      {settings?.accentColor && <div className="h-1 bg-[var(--brand-accent)]" aria-hidden />}
      <div className="flex flex-col gap-6 px-6 pt-8 pb-6 sm:px-9 sm:pt-10">
        <div className="flex flex-col items-center gap-4 text-center">
          {icon ?? (brand && <BrandMark settings={settings} />)}
          <div className="flex flex-col gap-1.5">
            <h1 className="text-2xl leading-tight">{title}</h1>
            {subtitle && <p className="text-sm text-graphite">{subtitle}</p>}
          </div>
        </div>
        {children}
      </div>
      {footer && (
        <div className="border-t border-rule bg-paper/60 px-6 py-4 text-center text-sm text-graphite sm:px-9">
          {footer}
        </div>
      )}
    </section>
  );
}
