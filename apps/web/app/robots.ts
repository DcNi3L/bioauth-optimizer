import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/shared/config';

/** Индексируются публичные страницы; личный кабинет, админ-панель, API и конечные точки OIDC — нет. */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: ['/', '/algorithm/', '/login', '/enroll', '/oauth/demo'],
        disallow: ['/admin', '/profile', '/oauth/consent', '/oauth/error', '/offline', '/api/', '/oidc/'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
