import { defineConfig } from '@playwright/test';

/** E2E против запущенной системы (docker compose up или pnpm dev): E2E_BASE_URL, по умолчанию localhost:3000. */
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  retries: 0,
  reporter: [['list']],
  use: { baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000', viewport: { width: 1440, height: 900 } },
});
