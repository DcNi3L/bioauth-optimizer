import { expect, test } from '@playwright/test';

/** Сервер авторизации глазами стороннего приложения: демо-клиент, вход, согласие, токены, отключение. */
test('OpenID Connect: код + PKCE через демо-клиент, согласие и отключение приложения', async ({
  page,
  baseURL,
}) => {
  const login = `oidc-${Date.now().toString(36)}`;
  const reg = await page.request.post('/api/v1/identity/subjects', {
    data: { login, displayName: 'Пользователь OIDC' },
    headers: { origin: baseURL! },
  });
  expect(reg.ok()).toBe(true);

  await page.goto('/oauth/demo');
  await page.getByRole('button', { name: 'Войти через BioAuth' }).click();
  await expect(page).toHaveURL(/\/oauth\/consent\?request=/);
  await expect(page.getByRole('heading', { name: /запрашивает доступ/ })).toBeVisible();
  await expect(page.getByText('Адрес почты')).toBeVisible();
  await page.getByRole('button', { name: 'Разрешить' }).click();

  await expect(page).toHaveURL(/\/oauth\/demo$/);
  await expect(page.getByText('Вход выполнен: Пользователь OIDC')).toBeVisible();
  await expect(page.getByText('"alg": "RS256"').first()).toBeVisible();
  await page.getByRole('button', { name: 'Запросить userinfo' }).click();
  await expect(page.getByText(`"preferred_username": "${login}"`).first()).toBeVisible();
  await page.getByRole('button', { name: 'Обновить токены' }).click();
  await expect(page.getByText('Вход выполнен: Пользователь OIDC')).toBeVisible();

  await page.goto('/profile/apps');
  await expect(page.getByText('bioauth-demo')).toBeVisible();
  await page.getByRole('button', { name: 'Отключить' }).click();
  await expect(page.getByText('Нет подключённых приложений.')).toBeVisible();

  await page.goto('/profile/activity');
  await expect(page.getByText('через приложение').first()).toBeVisible();
});

test('оболочка: боковая панель, смена языка и темы', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Язык' }).click();
  await page.getByRole('menuitemradio', { name: 'English' }).click();
  await expect(page.getByRole('link', { name: 'Algorithm' }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Theme' }).click();
  await page.getByRole('menuitemradio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  await page.getByRole('link', { name: 'Algorithm' }).first().click();
  await expect(page).toHaveURL(/\/algorithm\/threshold/);
});
