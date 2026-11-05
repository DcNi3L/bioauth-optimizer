'use client';

import { useMemo } from 'react';

import { type Locale, useI18n } from '../i18n';

const TAGS: Record<Locale, string> = { ru: 'ru-RU', kk: 'kk-KZ', en: 'en-GB' };

/** Даты на языке интерфейса: полная, короткая и относительная («5 мин назад»). */
export function useFormat() {
  const { locale, t } = useI18n();
  return useMemo(() => {
    const tag = TAGS[locale];
    const dateTime = (iso: string) =>
      new Date(iso).toLocaleString(tag, { dateStyle: 'medium', timeStyle: 'short' });
    const date = (iso: string) => new Date(iso).toLocaleDateString(tag, { dateStyle: 'medium' });
    const relative = (iso: string, now = Date.now()) => {
      const s = Math.max(0, Math.round((now - new Date(iso).getTime()) / 1000));
      if (s < 60) return t('time.justNow');
      if (s < 3600) return t('time.minutes', { n: Math.floor(s / 60) });
      if (s < 86_400) return t('time.hours', { n: Math.floor(s / 3600) });
      if (s < 86_400 * 14) return t('time.days', { n: Math.floor(s / 86_400) });
      return date(iso);
    };
    const number = (n: number) => n.toLocaleString(tag);
    return { dateTime, date, relative, number, tag };
  }, [locale, t]);
}
