import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { NO_INDEX } from '@/shared/config';
import { AdminShell } from '@/widgets/admin-shell';

export const metadata: Metadata = {
  title: { default: 'Администрирование', template: '%s · Администрирование · BioAuth' },
  ...NO_INDEX,
};

export default function AdminLayout({ children }: { children: ReactNode }) {
  return <AdminShell>{children}</AdminShell>;
}
