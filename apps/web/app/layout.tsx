import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import '@fontsource-variable/golos-text';
import '@fontsource-variable/literata';
import '@/app/styles/globals.css';
import { QueryProvider } from '@/app';
import { AppNav } from '@/widgets/app-nav';

export const metadata: Metadata = {
  title: 'BioAuth Optimizer',
  description: 'Оптимизация порога и состава факторов биометрической аутентификации',
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <QueryProvider>
          <AppNav />
          <main>{children}</main>
        </QueryProvider>
      </body>
    </html>
  );
}
