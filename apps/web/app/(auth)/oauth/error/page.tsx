import { Suspense } from 'react';

import { OauthErrorPage } from '@/pages/oauth/error';
import { NO_INDEX } from '@/shared/config';

export const metadata = { title: 'Ошибка авторизации', ...NO_INDEX };

export default function Page() {
  return (
    <Suspense>
      <OauthErrorPage />
    </Suspense>
  );
}
