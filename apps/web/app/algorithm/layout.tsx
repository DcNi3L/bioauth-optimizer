import type { Metadata } from 'next';
import type { ReactNode } from 'react';

import { AlgorithmShell } from '@/widgets/algorithm-shell';

export const metadata: Metadata = {
  title: { default: 'Алгоритм', template: '%s · Алгоритм · BioAuth' },
  description:
    'Все расчёты и пороги BioAuth на одной странице: порог, состав факторов, история, калибровка и протокол.',
};

export default function AlgorithmLayout({ children }: { children: ReactNode }) {
  return <AlgorithmShell>{children}</AlgorithmShell>;
}
