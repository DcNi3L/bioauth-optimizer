import { join } from 'node:path';

import { defineConfig } from '@playwright/test';

/**
 * E2E против запущенной системы (docker compose up или pnpm dev): E2E_BASE_URL, по умолчанию localhost:3000.
 * Проект biometrics (E2E_BIOMETRICS=1) нужен bio-engine и использует поддельную камеру Chromium.
 */
const FAKE_VIDEO = join(__dirname, 'test-results', 'fake-camera', 'face.y4m');
const biometrics = process.env.E2E_BIOMETRICS === '1';

export default defineConfig({
  testDir: './e2e',
  timeout: 90_000,
  retries: 0,
  reporter: [['list']],
  globalSetup: './e2e/global-setup.ts',
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    viewport: { width: 1440, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'optimizer', testMatch: /sro1\.spec\.ts/ },
    ...(biometrics
      ? [
          {
            name: 'biometrics',
            testMatch: /biometrics\.spec\.ts/,
            use: {
              permissions: ['camera'],
              launchOptions: {
                args: [
                  '--use-fake-ui-for-media-stream',
                  '--use-fake-device-for-media-stream',
                  `--use-file-for-fake-video-capture=${FAKE_VIDEO}`,
                ],
              },
            },
          },
        ]
      : []),
  ],
});
