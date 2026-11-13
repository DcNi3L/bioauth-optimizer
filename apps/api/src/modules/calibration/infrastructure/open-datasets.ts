import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { crc32, deflateSync } from 'node:zlib';

/**
 * Открытые наборы данных для полной калибровки (`make calibrate`, docs/10 §10.16). Файлы скачиваются с
 * закреплённых коммитов и проверяются по SHA-256: результат калибровки воспроизводим, подмена данных
 * обнаруживается. Скачанное кэшируется в каталоге; без сети можно положить файлы туда заранее.
 */

/**
 * AT&T «The Database of Faces» (ORL): 40 добровольцев × 10 снимков 92×112, градации серого, 1992–1994.
 * Используются снимки 1–9 каждого субъекта (зеркало на GitHub содержит их в Training/). Условие
 * использования — ссылка на AT&T Laboratories Cambridge.
 */
export const ORL = {
  name: 'AT&T (ORL) Database of Faces',
  base: 'https://raw.githubusercontent.com/saibaba/att_faces/3cab7bffd76e2ede3552bef0bd9b3927be0019f0/Training',
  subjects: 40,
  perSubject: 9,
  sha256: 'd0f65179ee8c4c0695b0b00d0576a85358f1343469318c359d108e4f4a2c2350',
  citation:
    'F. Samaria, A. Harter. Parameterisation of a stochastic model for human face identification. ' +
    'IEEE WACV, 1994. AT&T Laboratories Cambridge.',
} as const;

/**
 * CMU Keystroke Dynamics Benchmark (Killourhy & Maxion, 2009): 51 человек × 400 вводов пароля «.tie5Roanl»
 * за 8 сеансов; времена удержания H и интервалы «нажатие → нажатие» DD в секундах.
 */
export const CMU_KEYSTROKE = {
  name: 'CMU Keystroke Dynamics Benchmark (DSL-StrongPasswordData)',
  urls: [
    'https://raw.githubusercontent.com/njanakiev/keystroke-biometrics/be449be081388ea54c2ce467bd45c7032162c4d2/data/DSL-StrongPasswordData.csv',
    'https://www.cs.cmu.edu/~keystroke/DSL-StrongPasswordData.csv',
  ],
  file: 'DSL-StrongPasswordData.csv',
  sha256: '4a7086f601052e307eff24a4bc525c8d104662f8ba06da1ac8080e70a6d55789',
  citation:
    'K. S. Killourhy, R. A. Maxion. Comparing anomaly-detection algorithms for keystroke dynamics. ' +
    'IEEE/IFIP DSN, 2009.',
} as const;

export const sha256 = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex');

export class DatasetIntegrityError extends Error {}

async function cached(path: string): Promise<Buffer | null> {
  try {
    return await readFile(path);
  } catch {
    return null;
  }
}

async function download(url: string, signal?: AbortSignal): Promise<Buffer> {
  const res = await fetch(url, { signal: signal ?? AbortSignal.timeout(60_000) });
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return Buffer.from(await res.arrayBuffer());
}

async function save(path: string, data: Buffer): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, data);
}

/** Снимки ORL по субъектам: кэш → загрузка; общий SHA-256 по фиксированному порядку файлов. */
export async function loadOrl(cacheDir: string, log: (m: string) => void = () => undefined) {
  const files: { subject: string; name: string; data: Buffer }[] = [];
  let downloaded = 0;
  for (let s = 1; s <= ORL.subjects; s++) {
    for (let i = 1; i <= ORL.perSubject; i++) {
      const rel = `s${s}/${i}.pgm`;
      const path = join(cacheDir, 'orl', rel);
      let data = await cached(path);
      if (!data) {
        data = await download(`${ORL.base}/${rel}`);
        await save(path, data);
        downloaded++;
      }
      files.push({ subject: `s${String(s).padStart(2, '0')}`, name: `${i}.pgm`, data });
    }
  }
  const digest = createHash('sha256');
  for (const f of files) digest.update(f.data);
  const actual = digest.digest('hex');
  if (actual !== ORL.sha256) {
    throw new DatasetIntegrityError(
      `${ORL.name}: SHA-256 ${actual} не совпадает с ожидаемым — удалите ${join(cacheDir, 'orl')} и повторите`,
    );
  }
  log(`${ORL.name}: ${files.length} снимков (${downloaded ? `скачано ${downloaded}` : 'из кэша'})`);
  return files;
}

/** CSV CMU: кэш → основной адрес → запасной; проверка SHA-256. */
export async function loadCmuKeystroke(cacheDir: string, log: (m: string) => void = () => undefined) {
  const path = join(cacheDir, CMU_KEYSTROKE.file);
  let data = await cached(path);
  let source = 'кэш';
  if (!data || sha256(data) !== CMU_KEYSTROKE.sha256) {
    const errors: string[] = [];
    data = null;
    for (const url of CMU_KEYSTROKE.urls) {
      try {
        const d = await download(url);
        if (sha256(d) !== CMU_KEYSTROKE.sha256) throw new Error('SHA-256 не совпадает');
        data = d;
        source = url;
        break;
      } catch (err) {
        errors.push(`${url}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (!data) throw new DatasetIntegrityError(`${CMU_KEYSTROKE.name}: ${errors.join('; ')}`);
    await save(path, data);
  }
  log(`${CMU_KEYSTROKE.name}: ${data.length} байт (${source})`);
  return data;
}

/** Ввод одного человека: вектор [H…, DD…] в миллисекундах — тот же вид, что у признаков входа BioAuth. */
export interface TypingSubject {
  readonly id: string;
  readonly vectors: number[][];
}

/** Разбор CSV CMU: столбцы H.* и DD.* (секунды → мс), порядок повторов — как в файле (сеанс, повтор). */
export function parseCmuKeystroke(csv: Buffer | string): TypingSubject[] {
  const lines = csv.toString().trim().split(/\r?\n/);
  const header = lines[0]!.split(',');
  const h = header.flatMap((c, i) => (c.startsWith('H.') ? [i] : []));
  const dd = header.flatMap((c, i) => (c.startsWith('DD.') ? [i] : []));
  if (header[0] !== 'subject' || h.length === 0 || dd.length !== h.length - 1)
    throw new Error('неожиданный формат CSV CMU: нужны столбцы subject, H.* и DD.*');
  const bySubject = new Map<string, number[][]>();
  for (const line of lines.slice(1)) {
    const cells = line.split(',');
    const v = [...h, ...dd].map((i) => Number(cells[i]) * 1000);
    if (v.some((x) => !Number.isFinite(x) || x <= 0)) continue;
    const id = cells[0]!;
    const list = bySubject.get(id) ?? [];
    list.push(v);
    bySubject.set(id, list);
  }
  return [...bySubject].map(([id, vectors]) => ({ id, vectors }));
}

/** PGM (P5, 8 бит) → PNG в градациях серого: bio-engine принимает JPEG, PNG и BMP. */
export function pgmToPng(pgm: Buffer): Buffer {
  const m = /^P5\s+(?:#[^\n]*\n\s*)*(\d+)\s+(\d+)\s+(\d+)\s/.exec(pgm.toString('latin1', 0, 64));
  if (!m) throw new Error('не PGM P5');
  const [w, h, max] = [Number(m[1]), Number(m[2]), Number(m[3])];
  if (max > 255) throw new Error('поддерживается только 8-битный PGM');
  const pixels = pgm.subarray(m[0].length, m[0].length + w * h);
  if (pixels.length !== w * h) throw new Error('PGM обрезан');
  const raw = Buffer.alloc((w + 1) * h);
  for (let y = 0; y < h; y++) pixels.copy(raw, y * (w + 1) + 1, y * w, (y + 1) * w); // фильтр 0 у каждой строки
  const chunk = (type: string, body: Buffer) => {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'latin1'), body]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(tb));
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // бит на канал
  ihdr[9] = 0; // градации серого
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

/** Zip без сжатия (store): архив «<субъект>/<файл>» для пакетного режима. */
export function storedZip(entries: readonly { path: string; data: Buffer }[]): Buffer {
  const parts: Buffer[] = [];
  const central: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.path, 'utf8');
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4); // версия
    local.writeUInt16LE(0x0800, 6); // имена в UTF-8
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(e.data.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, e.data);
    const cd = Buffer.alloc(46);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(e.data.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(name.length, 28);
    cd.writeUInt32LE(offset, 42);
    central.push(cd, name);
    offset += 30 + name.length + e.data.length;
  }
  const cdBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cdBuf.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cdBuf, end]);
}
