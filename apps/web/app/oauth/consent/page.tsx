import { Suspense } from 'react';

import { OauthConsentPage } from '@/pages/oauth/consent';

export default function Page() {
  return (
    <Suspense>
      <OauthConsentPage />
    </Suspense>
  );
}
