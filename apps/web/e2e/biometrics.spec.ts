import { type BrowserContext, expect, type Page, test } from '@playwright/test';

/**
 * Живая биометрия в браузере (NFR-B5): поддельная камера Chromium с эталонным портретом и виртуальный
 * аутентификатор WebAuthn (Chrome DevTools Protocol). Запуск: E2E_BIOMETRICS=1 против системы с bio-engine.
 *
 * Сценарий: регистрация субъекта (согласие, лицо, passkey) → вход по политике по умолчанию отклоняется,
 * потому что статичное видео не выполняет команды (защита от фото) → администратор утверждает политику
 * «лицо без команд + passkey» → вход субъекта проходит оба шага.
 */
test.describe.configure({ mode: 'serial' });

const SUBJECT = `e2e-${Date.now().toString(36)}`;
const ADMIN_LOGIN = process.env.E2E_ADMIN_LOGIN ?? 'admin';
const ADMIN_PASSWORD = process.env.E2E_ADMIN_PASSWORD ?? 'change-me-admin-123';

/** Виртуальный платформенный аутентификатор с проверкой пользователя (как Touch ID). */
async function addVirtualAuthenticator(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
}

let subject: BrowserContext;
let subjectPage: Page;
let admin: BrowserContext | undefined;

test.beforeAll(async ({ browser }) => {
  subject = await browser.newContext({ permissions: ['camera'] });
  subjectPage = await subject.newPage();
  await addVirtualAuthenticator(subjectPage);
});

/** Возврат к исходной политике (версия 1), чтобы повторный прогон начинался с тех же условий. */
test.afterAll(async () => {
  await subject.close();
  if (!admin) return;
  const page = admin.pages()[0]!;
  const list = (await (await page.request.get('/api/v1/policies')).json()) as {
    id: string;
    version: number;
  }[];
  const first = list.find((p) => p.version === 1);
  if (first)
    await page.request.post(`/api/v1/policies/${first.id}/rollback`, { data: { note: 'e2e: возврат' } });
  // passkey администратора жил в виртуальном аутентификаторе этого прогона — удаляем его.
  const keys = (await (await page.request.get('/api/v1/webauthn/credentials')).json()) as { id: string }[];
  for (const k of keys) await page.request.delete(`/api/v1/webauthn/credentials/${encodeURIComponent(k.id)}`);
  await admin.close();
});

test('регистрация: учётная запись, согласие, лицо с камеры, passkey', async () => {
  const page = subjectPage;
  await page.goto('/enroll');
  await page.getByLabel('Логин').fill(SUBJECT);
  await page.getByLabel('Имя').fill('Участник e2e');
  await page.getByRole('button', { name: 'Создать учётную запись' }).click();

  await page.getByLabel('Я прочитал(а) текст и даю согласие').check();
  await page.getByRole('button', { name: 'Дать согласие' }).click();

  await page.getByRole('button', { name: 'Включить камеру' }).click();
  await page.getByRole('button', { name: 'Снять лицо' }).click();
  // После регистрации лица мастер переходит к шагу passkey.
  await page.getByRole('button', { name: 'Зарегистрировать passkey' }).click({ timeout: 30_000 });
  await expect(page.getByText('Passkey зарегистрирован.')).toBeVisible();

  await page.goto('/profile');
  await expect(page.getByText(/зарегистрирован .*, кадров: 5/)).toBeVisible();
  await expect(page.getByText('зарегистрировано: 1')).toBeVisible();
  await page.getByRole('button', { name: 'Выйти' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('статичное видео не выполняет команды — вход по политике по умолчанию отклоняется', async () => {
  const page = subjectPage;
  await page.goto('/login');
  await page.getByLabel('Логин').fill(SUBJECT);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.getByText(/выполните команды на экране/)).toBeVisible();
  await page.getByRole('button', { name: 'Начать проверку' }).click();
  await expect(page.getByText('Команды не выполнены')).toBeVisible({ timeout: 40_000 });
  await expect(page.getByText('Осталось попыток: 2')).toBeVisible();
  await page.getByRole('button', { name: 'Отмена' }).click();
});

test('администратор: пароль, passkey и утверждение политики «лицо + passkey»', async ({ browser }) => {
  admin = await browser.newContext();
  const page = await admin.newPage();
  await addVirtualAuthenticator(page);
  await page.goto('/login');
  await page.getByRole('radio', { name: 'Сотрудник' }).click();
  await page.getByLabel('Логин').fill(ADMIN_LOGIN);
  await page.getByLabel('Пароль').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: 'Войти' }).click();
  await expect(page).toHaveURL(/\/profile/);
  // Первый вход: passkey ещё нет — регистрация завершает двухфакторный вход.
  await page
    .getByRole('button', { name: /passkey/ })
    .first()
    .click();
  await expect(page.getByText('Двухфакторный вход')).toBeVisible();
  await expect(page.getByText('выполнен', { exact: true })).toBeVisible();

  const proposed = await page.request.post('/api/v1/policies', {
    data: {
      steps: [
        { factor: 'face', tauFace: 0.363, tauPad: 0.5, commands: 0, calibrated: false },
        { factor: 'passkey' },
      ],
      costs: { cFA: 200, cFR: 1 },
      rationale: 'e2e: вход по лицу без команд с обязательным passkey',
    },
  });
  expect(proposed.status()).toBe(201);
  const { id } = (await proposed.json()) as { id: string };
  const approved = await page.request.post(`/api/v1/policies/${id}/approve`, { data: { note: 'e2e' } });
  expect(approved.status()).toBe(200);
});

test('вход субъекта по новой политике: лицо, затем passkey', async () => {
  const page = subjectPage;
  await page.goto('/login');
  await page.getByLabel('Логин').fill(SUBJECT);
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await page.getByRole('button', { name: 'Начать проверку' }).click();
  await expect(page.getByText('Лицо подтверждено.')).toBeVisible({ timeout: 40_000 });
  await page.getByRole('button', { name: 'Подтвердить passkey' }).click();
  await expect(page).toHaveURL(/\/profile/, { timeout: 15_000 });
  await expect(page.getByRole('heading', { name: 'Участник e2e' })).toBeVisible();
});
