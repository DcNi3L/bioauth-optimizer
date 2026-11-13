import { Suspense } from 'react';

import { ApprovePage } from '@/pages/approve';
import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Подтверждение входа',
  'Подтверждение входа на другом устройстве.',
  '/approve',
  {
    private: true,
  },
);

export default function Page() {
  return (
    <Suspense>
      <ApprovePage />
    </Suspense>
  );
}
