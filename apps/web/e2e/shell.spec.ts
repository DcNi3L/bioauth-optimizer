import { expect, test } from '@playwright/test';

/** v3.4 (ADR-0026): отдельные страницы входа, сворачиваемая боковая панель и поиск ⌘K. */
test('вход и регистрация — без навигации консоли; ссылки между ними внутри карточки', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Добро пожаловать' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Зарегистрироваться' }).click();
  await expect(page).toHaveURL(/\/enroll/);
  await expect(page.getByRole('heading', { name: /Шаг 1 из 4/ })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Разделы' })).toHaveCount(0);
});

test('боковая панель сворачивается до иконок, выбор сохраняется после перезагрузки', async ({ page }) => {
  await page.goto('/algorithm/threshold');
  const nav = page.getByRole('navigation', { name: 'Разделы' });
  await page.getByRole('button', { name: 'Свернуть панель' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
  // Подписи скрыты визуально, но остаются доступным именем ссылок.
  await expect(nav.getByRole('link', { name: 'Алгоритм' })).toBeVisible();
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'collapsed');
  await page.getByRole('button', { name: 'Развернуть панель' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-sidebar', 'expanded');
});

test('поиск Ctrl+K: переход к разделу с клавиатуры', async ({ page }) => {
  await page.goto('/');
  await page.keyboard.press('Control+k');
  const search = page.getByRole('combobox', { name: /Поиск/ });
  await expect(search).toBeFocused();
  await search.fill('алгор');
  await expect(page.getByRole('option', { name: /Алгоритм/ })).toBeVisible();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/algorithm/);
});
