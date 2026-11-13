'use client';

import { createContext, type ReactNode, useCallback, useContext, useEffect } from 'react';

import { useMediaQuery, useStoredValue, writeStored } from '../lib/browser';

export type ThemeChoice = 'light' | 'dark' | 'system';
const KEY = 'bioauth.theme';

/** Скрипт до гидрации: класс dark ставится раньше первой отрисовки, без вспышки светлой темы. */
export const THEME_INIT_SCRIPT = `(function(){try{var c=localStorage.getItem('${KEY}')||'system';var d=c==='dark'||(c==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

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
