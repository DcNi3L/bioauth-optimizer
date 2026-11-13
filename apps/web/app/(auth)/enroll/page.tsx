import { Suspense } from 'react';

import { EnrollPage } from '@/pages/enroll';
import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Регистрация',
  'Регистрация в BioAuth: учётная запись, согласие на обработку биометрии, снимок лица и passkey.',
  '/enroll',
);

export default function Page() {
  return (
    <Suspense>
      <EnrollPage />
    </Suspense>
  );
}
