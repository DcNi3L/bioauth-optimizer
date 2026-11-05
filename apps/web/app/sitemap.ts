import type { MetadataRoute } from 'next';

import { SITE_URL } from '@/shared/config';

const PAGES: [string, number, MetadataRoute.Sitemap[number]['changeFrequency']][] = [
  ['/', 1, 'weekly'],
  ['/algorithm/threshold', 0.9, 'monthly'],
  ['/algorithm/factors', 0.9, 'monthly'],
  ['/algorithm/history', 0.5, 'daily'],
  ['/login', 0.7, 'yearly'],
  ['/enroll', 0.7, 'yearly'],
  ['/oauth/demo', 0.6, 'monthly'],
];

export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return PAGES.map(([path, priority, changeFrequency]) => ({
    url: `${SITE_URL}${path}`,
    lastModified,
    changeFrequency,
    priority,
  }));
}
