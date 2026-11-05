import { Suspense } from 'react';

import { OauthDemoPage } from '@/pages/oauth/demo';
import { pageMeta } from '@/shared/config';

export const metadata = pageMeta(
  'Демо-клиент OpenID Connect',
  'Пример стороннего приложения: вход через BioAuth по коду авторизации с PKCE, ID-токен RS256, userinfo и refresh-токены.',
  '/oauth/demo',
);

export default function Page() {
  return (
    <Suspense>
      <OauthDemoPage />
    </Suspense>
  );
}
