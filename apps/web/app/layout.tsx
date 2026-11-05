import '@fontsource-variable/golos-text';
import '@fontsource-variable/literata';
import '@/app/styles/globals.css';

import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';

import { QueryProvider } from '@/app';
import { THEME_INIT_SCRIPT } from '@/shared/theme';
import { AppShell } from '@/widgets/app-shell';

export const metadata: Metadata = {
  title: { default: 'BioAuth', template: '%s · BioAuth' },
  description: 'Сервер биометрической аутентификации и OpenID Connect с расчётом порога и состава факторов',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3f5f2' },
    { media: '(prefers-color-scheme: dark)', color: '#0e1318' },
  ],
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        {/* Тема до первой отрисовки — без вспышки светлого фона. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body>
        <QueryProvider>
          <AppShell>{children}</AppShell>
        </QueryProvider>
      </body>
    </html>
  );
}
