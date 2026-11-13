'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect } from 'react';

import { useMediaQuery, useStoredValue, writeStored } from '../lib/browser';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'bioauth.theme';

/** Ключ свёрнутой боковой панели: читается тем же скриптом до гидрации, чтобы панель не «прыгала». */
export const SIDEBAR_KEY = 'bioauth.sidebar';

/**
 * Скрипт до гидрации: класс dark и состояние боковой панели ставятся раньше первой отрисовки — без вспышки
 * светлой темы и без сдвига содержимого.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var h=document.documentElement;var c=localStorage.getItem('${KEY}')||'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);h.classList.toggle('dark',d);h.dataset.sidebar=localStorage.getItem('${SIDEBAR_KEY}')==='collapsed'?'collapsed':'expanded';}catch(e){}})();`;

interface ThemeValue {
  choice: ThemeChoice;
  resolved: 'light' | 'dark';
  setChoice: (c: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeValue>({
  choice: 'system',
  resolved: 'light',
  setChoice: () => undefined,
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const stored = useStoredValue(KEY);
  const choice: ThemeChoice = stored === 'light' || stored === 'dark' ? stored : 'system';
  const systemDark = useMediaQuery('(prefers-color-scheme: dark)');
  const resolved = choice === 'system' ? (systemDark ? 'dark' : 'light') : choice;
  useEffect(() => {
    document.documentElement.classList.toggle('dark', resolved === 'dark');
  }, [resolved]);
  const setChoice = useCallback((c: ThemeChoice) => writeStored(KEY, c), []);
  return <ThemeContext.Provider value={{ choice, resolved, setChoice }}>{children}</ThemeContext.Provider>;
}

export const useTheme = () => useContext(ThemeContext);
