'use client';

import { useSyncExternalStore } from 'react';

export { hardNavigate } from './navigate';

const noop = () => () => undefined;

/** Значение, известное только в браузере: на сервере и при гидратации — `server`, затем — `read()`. */
export function useBrowserValue<T>(
  read: () => T,
  server: T,
  subscribe: (cb: () => void) => () => void = noop,
): T {
  return useSyncExternalStore(subscribe, read, () => server);
}

/** Медиазапрос CSS (тема системы, тип указателя) с подпиской на изменения. */
export function useMediaQuery(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener('change', cb);
      return () => mq.removeEventListener('change', cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

const STORAGE_EVENT = 'bioauth:storage';

/**
 * Значение из localStorage как внешнее хранилище: читается без эффекта после монтирования и обновляется
 * во всех компонентах (и вкладках) после записи через `writeStored`.
 */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    (cb) => {
      const on = (e: Event) => {
        if (!(e instanceof StorageEvent) || e.key === key) cb();
      };
      window.addEventListener('storage', on);
      window.addEventListener(STORAGE_EVENT, on);
      return () => {
        window.removeEventListener('storage', on);
        window.removeEventListener(STORAGE_EVENT, on);
      };
    },
    () => readStored(key),
    () => null,
  );
}

/** Запасная копия на случай приватного режима: выбор действует до перезагрузки страницы. */
const memory = new Map<string, string>();

export function readStored(key: string): string | null {
  try {
    return window.localStorage.getItem(key) ?? memory.get(key) ?? null;
  } catch {
    return memory.get(key) ?? null;
  }
}

/** Запись в localStorage с оповещением подписчиков `useStoredValue`; в приватном режиме — без сохранения. */
export function writeStored(key: string, value: string): void {
  memory.set(key, value);
  try {
    window.localStorage.setItem(key, value);
  } catch {
    /* приватный режим или запрет хранилища */
  }
  window.dispatchEvent(new Event(STORAGE_EVENT));
}
