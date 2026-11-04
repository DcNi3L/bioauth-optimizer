import { createApp } from './bootstrap';
import { APP_CONFIG, type AppConfig } from './shared/config/env';

async function main(): Promise<void> {
  const app = await createApp();
  const { PORT } = app.get<AppConfig>(APP_CONFIG);
  await app.listen(PORT, '0.0.0.0');
}

void main();
