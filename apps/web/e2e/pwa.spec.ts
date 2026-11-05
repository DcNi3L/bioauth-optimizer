import { expect, test } from '@playwright/test';

/** PWA и SEO: манифест, service worker, работа без сети, robots.txt, sitemap.xml и метаданные страниц. */
test('PWA: манифест, service worker и страница «Нет соединения» без сети', async ({ page, context }) => {
  const manifest = (await (await page.request.get('/manifest.webmanifest')).json()) as {
    icons: { src: string; purpose: string; sizes: string }[];
  };
  expect(manifest).toMatchObject({ short_name: 'BioAuth', display: 'standalone', start_url: '/?source=pwa' });
  expect(
    manifest.icons.some(
      (i: { purpose: string; sizes: string }) => i.purpose === 'maskable' && i.sizes === '512x512',
    ),
  ).toBe(true);
  for (const icon of manifest.icons) expect((await page.request.get(icon.src)).ok()).toBe(true);

  await page.goto('/');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expect.poll(() => page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);
  await page.goto('/algorithm/threshold');

  await context.setOffline(true);
  await page.goto('/algorithm/threshold');
  await expect(page.getByRole('heading', { name: 'Алгоритм' })).toBeVisible();
  await page.goto('/enroll');
  await expect(page.getByRole('heading', { name: 'Нет соединения' })).toBeVisible();
  await context.setOffline(false);
});

test('SEO: robots.txt, sitemap.xml, канонические ссылки, Open Graph и закрытые разделы', async ({ page }) => {
  const robots = await (await page.request.get('/robots.txt')).text();
  expect(robots).toContain('Disallow: /admin');
  expect(robots).toMatch(/Sitemap: .*\/sitemap\.xml/);
  const sitemap = await (await page.request.get('/sitemap.xml')).text();
  expect(sitemap).toContain('/algorithm/threshold</loc>');

  await page.goto('/algorithm/factors');
  await expect(page).toHaveTitle('Состав факторов · Алгоритм · BioAuth');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href', /\/algorithm\/factors$/);
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute('content', /opengraph-image\.png/);
  expect((await page.request.get('/opengraph-image.png')).headers()['content-type']).toBe('image/png');
  await expect(page.locator('script[type="application/ld+json"]')).toHaveCount(1);

  await page.goto('/admin');
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
});
