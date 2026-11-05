import type { MetadataRoute } from 'next';

import { BRAND, SITE_DESCRIPTION, THEME_LIGHT } from '@/shared/config';

/** Манифест PWA: установка на рабочий стол и домашний экран, ярлыки основных разделов. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: 'BioAuth — биометрическая аутентификация',
    short_name: 'BioAuth',
    description: SITE_DESCRIPTION,
    lang: 'ru',
    dir: 'ltr',
    start_url: '/?source=pwa',
    scope: '/',
    display: 'standalone',
    display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
    orientation: 'any',
    background_color: THEME_LIGHT,
    theme_color: BRAND,
    categories: ['security', 'productivity', 'utilities'],
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
      { src: '/icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
      { src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
    ],
    shortcuts: [
      {
        name: 'Вход',
        short_name: 'Вход',
        url: '/login',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Алгоритм',
        short_name: 'Алгоритм',
        url: '/algorithm',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Профиль',
        short_name: 'Профиль',
        url: '/profile',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
      {
        name: 'Админ-панель',
        short_name: 'Админ',
        url: '/admin',
        icons: [{ src: '/icons/icon-192.png', sizes: '192x192' }],
      },
    ],
    screenshots: [
      {
        src: '/screenshots/wide.png',
        sizes: '1440x900',
        type: 'image/png',
        form_factor: 'wide',
        label: 'Админ-панель',
      },
      {
        src: '/screenshots/narrow.png',
        sizes: '390x844',
        type: 'image/png',
        form_factor: 'narrow',
        label: 'Главная',
      },
    ],
  };
}
