import type { ReactNode } from 'react';

import { AuthShell } from '@/widgets/auth-shell';

/** Вход, регистрация и решения OAuth — отдельная оболочка без навигации консоли (как Universal Login). */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <AuthShell>{children}</AuthShell>;
}
