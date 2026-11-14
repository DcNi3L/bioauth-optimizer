#!/usr/bin/env node
/**
 * make secrets — настоящие секреты в .env вместо демонстрационных (docs/06-deployment.md §6.8).
 *
 *   node scripts/secrets.mjs              сгенерировать недостающие и демонстрационные значения
 *   node scripts/secrets.mjs --rotate=ADMIN_PASSWORD   заменить и уже настоящее значение
 *   node scripts/secrets.mjs --drop-dev   убрать ключ разработки «dev» из TEMPLATE_KEYS (после make rekey)
 *
 * Значения создаются здесь, криптографическим генератором, и пишутся только в .env (он в .gitignore) с правами 600.
 * Уже заданные настоящие значения не трогаются: повторный запуск ничего не меняет. Ключ шаблонов не заменяется,
 * а добавляется: старый «dev» остаётся для расшифровки, пока make rekey не перешифрует шаблоны.
 * Список изменённых переменных — в .env.rotated (по одной на строку), его читает Makefile и удаляет только после
 * всех шагов: прерванный make secrets при повторном запуске доделывает их.
 */
import { randomBytes } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const envPath = resolve(root, '.env');
const rotatedPath = resolve(root, '.env.rotated');
const dropDev = process.argv.includes('--drop-dev');
/** --rotate=ADMIN_PASSWORD,BIO_ENGINE_SECRET — заменить и уже настоящие значения (например, пароль попал в чат). */
const forced = new Set(
  (process.argv.find((a) => a.startsWith('--rotate='))?.slice('--rotate='.length) ?? '')
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean),
);

/** Ключ разработки шаблонов (apps/api/src/shared/config/env.ts): 32 байта со значением 7. */
const DEV_KEY = Buffer.alloc(32, 7).toString('base64');

/** Демонстрационные значения из .env.example и docker-compose.yml: их заменяем всегда. */
const DEMO = {
  POSTGRES_PASSWORD: ['bioauth'],
  ADMIN_PASSWORD: ['change-me-admin-123'],
  BIO_ENGINE_SECRET: ['dev-bio-secret-change-me'],
  METRICS_TOKEN: [],
  GRAFANA_PASSWORD: ['change-me-grafana'],
};

const token = (bytes) => randomBytes(bytes).toString('base64url');
/** Пароль для входа человеком: без похожих символов, 20 знаков. */
function password() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  const out = [];
  while (out.length < 20) {
    const b = randomBytes(1)[0];
    if (b < 256 - (256 % alphabet.length)) out.push(alphabet[b % alphabet.length]);
  }
  return `${out.slice(0, 5).join('')}-${out.slice(5, 10).join('')}-${out.slice(10, 15).join('')}-${out.slice(15).join('')}`;
}

const GENERATE = {
  POSTGRES_PASSWORD: () => token(24),
  ADMIN_PASSWORD: password,
  BIO_ENGINE_SECRET: () => token(32),
  METRICS_TOKEN: () => token(32),
  GRAFANA_PASSWORD: password,
};

const source = existsSync(envPath)
  ? readFileSync(envPath, 'utf8')
  : readFileSync(resolve(root, '.env.example'), 'utf8');
const lines = source.split('\n');
const get = (key) => {
  const line = lines.find((l) => l.startsWith(`${key}=`));
  return line === undefined ? undefined : line.slice(key.length + 1).replace(/^'(.*)'$/, '$1');
};
const set = (key, value) => {
  const quoted = /[\s"#{}$]/.test(value) ? `'${value}'` : value;
  const i = lines.findIndex((l) => l.startsWith(`${key}=`) || l.startsWith(`# ${key}=`));
  if (i >= 0) lines[i] = `${key}=${quoted}`;
  else lines.push(`${key}=${quoted}`);
};

const rotated = [];
if (dropDev) {
  const keys = JSON.parse(get('TEMPLATE_KEYS') ?? '{}');
  if ('dev' in keys) {
    delete keys.dev;
    if (Object.keys(keys).length === 0) throw new Error('в TEMPLATE_KEYS нет ключа, кроме dev');
    set('TEMPLATE_KEYS', JSON.stringify(keys));
    rotated.push('TEMPLATE_KEYS');
  }
} else {
  for (const [key, make] of Object.entries(GENERATE)) {
    const current = get(key);
    if (forced.has(key) || current === undefined || current === '' || DEMO[key].includes(current)) {
      set(key, make());
      rotated.push(key);
    }
  }
  let keys = {};
  try {
    keys = JSON.parse(get('TEMPLATE_KEYS') || '{}');
  } catch {
    throw new Error('TEMPLATE_KEYS в .env — не JSON; исправьте вручную');
  }
  const active = get('TEMPLATE_ACTIVE_KEY');
  if (forced.has('TEMPLATE_KEYS') || !active || active === 'dev' || !keys[active]) {
    const id = `k${new Date().toISOString().slice(0, 10).replaceAll('-', '')}`;
    // Новый ключ — первым и активным; «dev» — для расшифровки уже сохранённых шаблонов до make rekey.
    keys = { [id]: randomBytes(32).toString('base64'), ...keys, dev: keys.dev ?? DEV_KEY };
    set('TEMPLATE_KEYS', JSON.stringify(keys));
    set('TEMPLATE_ACTIVE_KEY', id);
    rotated.push('TEMPLATE_KEYS');
  }
  if (get('ALLOW_DEV_KEYS') !== 'false') {
    set('ALLOW_DEV_KEYS', 'false');
    rotated.push('ALLOW_DEV_KEYS');
  }
}

writeFileSync(envPath, `${lines.join('\n').trimEnd()}\n`, { mode: 0o600 });
chmodSync(envPath, 0o600);
// Незавершённый прошлый запуск (например, упал перезапуск): его шаги тоже нужно доделать.
const pending = existsSync(rotatedPath) ? readFileSync(rotatedPath, 'utf8').split('\n').filter(Boolean) : [];
const steps = [...new Set([...pending, ...rotated])];
writeFileSync(rotatedPath, steps.length ? `${steps.join('\n')}\n` : '');
if (pending.length && !dropDev)
  process.stdout.write(`  доделываю незавершённые шаги прошлого запуска: ${pending.join(', ')}\n`);
process.stdout.write(
  rotated.length
    ? `  .env: заменено ${rotated.join(', ')}\n`
    : '  .env: все секреты уже настоящие — ничего не изменено\n',
);
