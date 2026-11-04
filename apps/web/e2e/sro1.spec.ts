import { expect, test } from '@playwright/test';

test('порог: пример из статьи СРО1 даёт τ* = 0,5818 и Δ = 41,8 %', async ({ page }) => {
  await page.goto('/threshold');
  await page.getByRole('button', { name: 'Пример из статьи СРО1' }).click();
  await expect(page.getByLabel('Среднее оценки μ_G')).toHaveValue('0,72');
  await page.getByRole('button', { name: 'Рассчитать' }).click();
  await expect(page.getByText('τ = 0,5818')).toBeVisible();
  await expect(page.getByText('41,8 %').first()).toBeVisible();
  await expect(page.getByRole('img', { name: /График ошибок/ })).toBeVisible();
});

test('состав факторов: оптимум F2 + F5, при бюджете 2,0 — F1 + F2', async ({ page }) => {
  await page.goto('/factors');
  await page.getByRole('button', { name: 'Пример из статьи СРО1' }).click();
  await page.getByRole('button', { name: 'Подобрать набор' }).click();
  await expect(page.locator('p.font-serif', { hasText: 'F2 + F5' })).toBeVisible();
  await expect(page.getByText('6 из 31')).toBeVisible();
  await page.getByLabel('Бюджет B не более').fill('2,0');
  await page.getByRole('button', { name: 'Подобрать набор' }).click();
  await expect(page.locator('p.font-serif', { hasText: 'F1 + F2' })).toBeVisible();
});

test('история: последний эксперимент открывается с тем же результатом', async ({ page }) => {
  await page.goto('/experiments');
  const first = page.locator('tbody tr').first().getByRole('link');
  const headline = await first.textContent();
  await first.click();
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
  await expect(page.getByText('Входные данные и полный результат')).toBeVisible();
  expect(headline).toBeTruthy();
});

test('ошибка ввода показывается рядом с полем', async ({ page }) => {
  await page.goto('/threshold');
  await page.getByLabel('Среднее оценки μ_G').fill('0,2');
  await page.getByLabel('Отклонение σ_G').fill('0,1');
  await page.getByLabel('Среднее оценки μ_I').fill('0,3');
  await page.getByLabel('Отклонение σ_I').fill('abc');
  await page.getByRole('button', { name: 'Рассчитать' }).click();
  await expect(page.getByText('Введите число')).toBeVisible();
  // Межполевая проверка выполняется, когда все поля — числа.
  await page.getByLabel('Отклонение σ_I').fill('0,11');
  await page.getByRole('button', { name: 'Рассчитать' }).click();
  await expect(page.getByText(/среднее законных пользователей должно быть больше/)).toBeVisible();
});
