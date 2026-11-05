import type { ReactNode } from 'react';

import { AlgorithmShell } from '@/widgets/algorithm-shell';

export default function AlgorithmLayout({ children }: { children: ReactNode }) {
  return <AlgorithmShell>{children}</AlgorithmShell>;
}
