import { createApp } from './bootstrap';
import { APP_CONFIG, type AppConfig } from './shared/config/env';

/** В разработке переменные можно держать в apps/api/.env (см. .env.example); в контейнере они задаются compose. */
function loadDotEnv(): void {
  if (process.env.NODE_ENV === 'production') return;
  try {
    process.loadEnvFile('.env');
  } catch {
    // файла нет — используем окружение процесса
  }
}

async function main(): Promise<void> {
  loadDotEnv();
  const app = await createApp();
  const { PORT } = app.get<AppConfig>(APP_CONFIG);
  await app.listen(PORT, '0.0.0.0');
}

void main();
