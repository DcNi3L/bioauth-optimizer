// Листинг исходного текста вычислительного ядра для депонирования при регистрации программы для ЭВМ.
// Файлы идут в алфавитном порядке, строки пронумерованы; тесты и сборка не включаются.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = 'packages/optimization-core/src';
const OUT = 'docs/deliverables/kazpatent/listing-optimization-core.txt';

const walk = (dir) =>
  readdirSync(dir)
    .sort()
    .flatMap((name) => {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) return name === '__tests__' ? [] : walk(path);
      return /\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name) ? [path] : [];
    });

const files = walk(ROOT);
let total = 0;
const parts = files.map((file) => {
  const lines = readFileSync(file, 'utf8').replace(/\n$/, '').split('\n');
  total += lines.length;
  const body = lines.map((l, i) => `${String(i + 1).padStart(4)}  ${l}`).join('\n');
  return `${'='.repeat(100)}\nФайл: ${relative('.', file)} (строк: ${lines.length})\n${'='.repeat(100)}\n${body}\n`;
});

const version = JSON.parse(readFileSync('packages/optimization-core/package.json', 'utf8')).version;
const head = [
  'BioAuth Optimizer — программное средство многокритериальной оптимизации параметров систем',
  'биометрической аутентификации. Исходный текст вычислительного ядра (@bioauth/optimization-core).',
  `Версия ядра: ${version}. Язык: TypeScript. Файлов: ${files.length}, строк: ${total}.`,
  'Автор: Мекенбаев Даниэль Кайратханович.',
  '',
].join('\n');
writeFileSync(OUT, `${head}\n${parts.join('\n')}`);
process.stdout.write(`Создан ${OUT}: файлов ${files.length}, строк ${total}\n`);
