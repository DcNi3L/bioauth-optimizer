import { join } from 'node:path';
import { loadConfig } from '../config/env';
import { createDb } from './kysely';
import { migrate } from './migrator';
import { seedPresetCatalogs } from '../../modules/factor-catalogs/infrastructure/seed-presets';

/** Миграции + идемпотентный seed; запускается перед стартом api (docker/api.Dockerfile). */
async function run(): Promise<void> {
  const config = loadConfig();
  const dir = process.env.MIGRATIONS_DIR ?? join(__dirname, '..', '..', '..', 'migrations');
  const log = (m: string) => console.log(JSON.stringify({ level: 'info', msg: m }));
  const applied = await migrate(config.DATABASE_URL, dir, log);
  if (applied.length === 0) log('новых миграций нет');
  const db = createDb(config.DATABASE_URL, 1);
  try {
    if (await seedPresetCatalogs(db)) log('создан предустановленный каталог СРО1');
  } finally {
    await db.destroy();
  }
}

run().catch((err) => {
  console.error(JSON.stringify({ level: 'fatal', msg: (err as Error).message }));
  process.exit(1);
});
