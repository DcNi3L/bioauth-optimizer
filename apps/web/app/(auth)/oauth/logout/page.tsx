import { Suspense } from 'react';

import { OauthLogoutPage } from '@/pages/oauth/logout';
import { NO_INDEX } from '@/shared/config';

export const metadata = { title: 'Выход', ...NO_INDEX };

export default function Page() {
  return (
    <Suspense>
      <OauthLogoutPage />
    </Suspense>
  );
}
