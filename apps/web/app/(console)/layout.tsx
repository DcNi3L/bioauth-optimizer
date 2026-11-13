import type { ReactNode } from 'react';

import { AppShell } from '@/widgets/app-shell';

/** Консоль: боковая панель с навигацией, верхняя панель, поиск. */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
  return <AppShell>{children}</AppShell>;
}
