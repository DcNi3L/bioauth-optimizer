import { Suspense } from 'react';

import { OauthConsentPage } from '@/pages/oauth/consent';
import { NO_INDEX } from '@/shared/config';

export const metadata = { title: 'Разрешение доступа', ...NO_INDEX };

export default function Page() {
  return (
    <Suspense>
      <OauthConsentPage />
    </Suspense>
  );
}
