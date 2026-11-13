'use client';

import { Languages, Monitor, Moon, Sun } from 'lucide-react';

import { LOCALES, useI18n, useT } from '@/shared/i18n';
import { type ThemeChoice, useTheme } from '@/shared/theme';

import { Menu, MenuItem } from './menu';

/** Кнопки верхней панели: язык и тема. Есть и в консоли, и на страницах входа. */
const iconBtn =
  'text-graphite hover:text-ink hover:bg-hover inline-flex h-9 items-center gap-1.5 rounded-lg px-2.5 text-sm transition-colors';

export function LanguageMenu() {
  const { locale, setLocale, t } = useI18n();
  const current = LOCALES.find((l) => l.code === locale)!;
  return (
    <Menu
      label={t('topbar.language')}
      triggerClassName={iconBtn}
      trigger={
        <>
          <Languages className="size-[18px]" aria-hidden />
          <span className="font-medium">{current.short}</span>
        </>
      }
    >
      {(close) =>
        LOCALES.map((l) => (
          <MenuItem
            key={l.code}
            selected={l.code === locale}
            onSelect={() => {
              setLocale(l.code);
              close();
            }}
            icon={<span className="text-[11px] font-semibold">{l.short}</span>}
          >
            {l.label}
          </MenuItem>
        ))
      }
    </Menu>
  );
}

const THEME_ICONS = { light: Sun, dark: Moon, system: Monitor } as const;

export function ThemeMenu() {
  const t = useT();
  const { choice, resolved, setChoice } = useTheme();
  const Current = resolved === 'dark' ? Moon : Sun;
  return (
    <Menu
      label={t('topbar.theme')}
      triggerClassName={iconBtn}
      trigger={<Current className="size-[18px]" aria-hidden />}
    >
      {(close) =>
        (['light', 'dark', 'system'] as ThemeChoice[]).map((c) => {
          const Icon = THEME_ICONS[c];
          return (
            <MenuItem
              key={c}
              selected={choice === c}
              icon={<Icon />}
              onSelect={() => {
                setChoice(c);
                close();
              }}
            >
              {t(`topbar.${c}`)}
            </MenuItem>
          );
        })
      }
    </Menu>
  );
}
