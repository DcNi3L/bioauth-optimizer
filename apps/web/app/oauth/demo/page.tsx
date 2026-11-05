import { Suspense } from 'react';

import { OauthDemoPage } from '@/pages/oauth/demo';

export default function Page() {
  return (
    <Suspense>
      <OauthDemoPage />
    </Suspense>
  );
}
