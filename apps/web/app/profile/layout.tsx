import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { NO_INDEX } from '@/shared/config';
import { ProfileShell } from '@/widgets/profile-shell';

export const metadata: Metadata = {
  title: { default: 'Профиль', template: '%s · Профиль · BioAuth' },
  ...NO_INDEX,
};

export default function ProfileLayout({ children }: { children: ReactNode }) {
  return <ProfileShell>{children}</ProfileShell>;
}
