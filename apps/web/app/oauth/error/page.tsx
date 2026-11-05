import { Suspense } from 'react';

import { OauthErrorPage } from '@/pages/oauth/error';

export default function Page() {
  return (
    <Suspense>
      <OauthErrorPage />
    </Suspense>
  );
}
