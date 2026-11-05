import type { Metadata } from 'next';

import { SITE_NAME } from './site';

const OG_IMAGE = { url: '/opengraph-image.png', width: 1200, height: 630, alt: 'BioAuth' };

/** Метаданные страницы: заголовок, описание, каноническая ссылка и Open Graph; private — не индексировать. */
export function pageMeta(
  title: string,
  description: string,
  path: string,
  opts: { private?: boolean } = {},
): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    // Open Graph страницы заменяет корневой целиком, поэтому общие поля повторяются здесь.
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ru_RU',
      alternateLocale: ['kk_KZ', 'en_US'],
      title,
      description,
      url: path,
      images: [OG_IMAGE],
    },
    twitter: { card: 'summary_large_image', title, description, images: [OG_IMAGE.url] },
    ...(opts.private && { robots: { index: false, follow: false, nocache: true } }),
  };
}

export const NO_INDEX: Metadata = { robots: { index: false, follow: false, nocache: true } };
