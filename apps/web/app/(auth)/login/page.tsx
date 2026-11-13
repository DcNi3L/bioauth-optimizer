import { Suspense } from 'react';

import { LoginPage } from '@/pages/login';
import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Вход',
  'Вход по лицу со случайными командами и passkey; вход сотрудника по паролю и passkey.',
  '/login',
);

export default function Page() {
  return (
    <Suspense>
      <LoginPage />
    </Suspense>
  );
}
