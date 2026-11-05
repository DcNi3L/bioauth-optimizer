'use client';

import { useEffect } from 'react';

/** Регистрация service worker — только в сборке для эксплуатации, чтобы не мешать горячей перезагрузке. */
export function ServiceWorker() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => undefined);
  }, []);
  return null;
}
