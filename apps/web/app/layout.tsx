import '@fontsource-variable/golos-text';
import '@fontsource-variable/literata';
import '@/app/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import type { ReactNode } from 'react';

import { QueryProvider, ServiceWorker } from '@/app';
import { SITE_DESCRIPTION, SITE_NAME, SITE_TITLE, SITE_URL, THEME_DARK, THEME_LIGHT } from '@/shared/config';
import { THEME_INIT_SCRIPT } from '@/shared/theme';

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: { default: SITE_TITLE, template: `%s · ${SITE_NAME}` },
  description: SITE_DESCRIPTION,
  applicationName: SITE_NAME,
  generator: 'Next.js',
  keywords: [
    'биометрическая аутентификация',
    'распознавание лица',
    'проверка живости',
    'PAD',
    'passkey',
    'WebAuthn',
    'FIDO2',
    'OpenID Connect',
    'OAuth 2.1',
    'PKCE',
    'сервер авторизации',
    'FAR',
    'FRR',
    'оптимальный порог',
    'байесовская стоимость',
    'многофакторная аутентификация',
  ],
  authors: [{ name: 'Мекенбаев Даниэль Кайратханович' }],
  creator: 'Мекенбаев Даниэль Кайратханович',
  publisher: 'Университет «Туран»',
  category: 'security',
  alternates: { canonical: '/' },
  formatDetection: { telephone: false, email: false, address: false },
  openGraph: {
    type: 'website',
    siteName: SITE_NAME,
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    url: '/',
    locale: 'ru_RU',
    alternateLocale: ['kk_KZ', 'en_US'],
  },
  twitter: { card: 'summary_large_image', title: SITE_TITLE, description: SITE_DESCRIPTION },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, 'max-image-preview': 'large', 'max-snippet': -1 },
  },
  appleWebApp: { capable: true, title: SITE_NAME, statusBarStyle: 'black-translucent' },
  other: { 'mobile-web-app-capable': 'yes' },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  colorScheme: 'light dark',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: THEME_LIGHT },
    { media: '(prefers-color-scheme: dark)', color: THEME_DARK },
  ],
};

/** Структурированные данные schema.org: сайт и программа (поисковики показывают их в карточке). */
const JSON_LD = {
  '@context': 'https://schema.org',
  '@graph': [
    { '@type': 'WebSite', name: SITE_NAME, url: SITE_URL, inLanguage: ['ru', 'kk', 'en'] },
    {
      '@type': 'SoftwareApplication',
      name: SITE_NAME,
      url: SITE_URL,
      applicationCategory: 'SecurityApplication',
      operatingSystem: 'Web',
      description: SITE_DESCRIPTION,
      offers: { '@type': 'Offer', price: '0', priceCurrency: 'KZT' },
      author: { '@type': 'Person', name: 'Мекенбаев Даниэль Кайратханович' },
      sourceOrganization: { '@type': 'CollegeOrUniversity', name: 'Университет «Туран»' },
    },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <body>
        {/* Тема до первой отрисовки — без вспышки светлого фона (Next вставляет скрипт в начало документа). */}
        <Script id="theme-init" strategy="beforeInteractive">
          {THEME_INIT_SCRIPT}
        </Script>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(JSON_LD).replace(/</g, '\\u003c') }}
        />
        <QueryProvider>
          {children}
          <ServiceWorker />
        </QueryProvider>
      </body>
    </html>
  );
}
