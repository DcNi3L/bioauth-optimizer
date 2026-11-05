'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import { en } from './dict/en';
import { kk } from './dict/kk';
import { type Dict, ru } from './dict/ru';

export type Locale = 'ru' | 'kk' | 'en';
export const LOCALES: readonly { code: Locale; label: string; short: string }[] = [
  { code: 'ru', label: 'Русский', short: 'RU' },
  { code: 'kk', label: 'Қазақша', short: 'KZ' },
  { code: 'en', label: 'English', short: 'EN' },
];

const DICTS: Record<Locale, Dict> = { ru, kk, en };
const STORAGE_KEY = 'bioauth.locale';

/** Ключи вида «face.issue.NO_FACE» — пути к строкам словаря. */
type Paths<T, P extends string = ''> = {
  [K in keyof T & string]: T[K] extends string ? `${P}${K}` : Paths<T[K], `${P}${K}.`>;
}[keyof T & string];
export type TKey = Paths<Dict>;
export type TFn = (key: TKey, vars?: Record<string, string | number>) => string;

function lookup(dict: Dict, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur === null || typeof cur !== 'object') return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return typeof cur === 'string' ? cur : undefined;
}

export function translate(locale: Locale, key: TKey, vars?: Record<string, string | number>): string {
  const raw = lookup(DICTS[locale], key) ?? lookup(ru, key) ?? key;
  return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? `{${k}}`)) : raw;
}

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: TFn;
}

const I18nContext = createContext<I18nValue>({
  locale: 'ru',
  setLocale: () => undefined,
  t: (key, vars) => translate('ru', key, vars),
});

function readStored(): Locale | null {
  try {
    const v = window.localStorage.getItem(STORAGE_KEY);
    return v === 'ru' || v === 'kk' || v === 'en' ? v : null;
  } catch {
    return null;
  }
}

/** Язык интерфейса: выбор хранится в браузере; по умолчанию — русский. */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ru');
  useEffect(() => {
    const stored = readStored();
    if (stored) setLocaleState(stored);
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      // приватный режим: язык действует до перезагрузки
    }
  }, []);
  const value = useMemo<I18nValue>(
    () => ({ locale, setLocale, t: (key, vars) => translate(locale, key, vars) }),
    [locale, setLocale],
  );
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export const useI18n = () => useContext(I18nContext);
export const useT = (): TFn => useContext(I18nContext).t;
