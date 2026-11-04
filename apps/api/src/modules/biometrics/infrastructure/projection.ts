import { createHmac } from 'node:crypto';

/**
 * Отменяемый шаблон (ISO/IEC 24745): случайная ортогональная проекция P с ключом на субъекта.
 * P сохраняет скалярные произведения (косинус не меняется), но хранимый вектор P·e не совпадает
 * с исходным и с шаблонами других систем; при компрометации ключ меняется, шаблон перевыпускается.
 */

/** Генератор sfc32 — детерминированный, с 128-битным зерном. */
function sfc32(seed: Buffer): () => number {
  let a = seed.readUInt32LE(0);
  let b = seed.readUInt32LE(4);
  let c = seed.readUInt32LE(8);
  let d = seed.readUInt32LE(12);
  return () => {
    a |= 0;
    b |= 0;
    c |= 0;
    d |= 0;
    const t = (((a + b) | 0) + d) | 0;
    d = (d + 1) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    c = (c + t) | 0;
    return (t >>> 0) / 4294967296;
  };
}

function gaussian(rand: () => number): number {
  let u = 0;
  while (u === 0) u = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
}

/** Строки ортонормированной матрицы n×n (модифицированный Грам — Шмидт по гауссовой матрице). */
export function orthogonalMatrix(key: Buffer, subject: string, n: number): Float64Array[] {
  const seed = createHmac('sha256', key).update(`projection:v1:${subject}`).digest();
  const rand = sfc32(seed);
  const rows: Float64Array[] = [];
  while (rows.length < n) {
    const v = Float64Array.from({ length: n }, () => gaussian(rand));
    for (const q of rows) {
      let dot = 0;
      for (let i = 0; i < n; i++) dot += v[i]! * q[i]!;
      for (let i = 0; i < n; i++) v[i]! -= dot * q[i]!;
    }
    let norm = 0;
    for (let i = 0; i < n; i++) norm += v[i]! * v[i]!;
    norm = Math.sqrt(norm);
    if (norm < 1e-8) continue; // практически невозможно; повторяем с новым вектором
    for (let i = 0; i < n; i++) v[i]! /= norm;
    rows.push(v);
  }
  return rows;
}

/** y = P·x */
export function project(p: readonly Float64Array[], x: readonly number[]): number[] {
  return p.map((row) => row.reduce((s, r, i) => s + r * x[i]!, 0));
}

/** x = Pᵀ·y (P ортогональна, обратная — транспонированная) */
export function unproject(p: readonly Float64Array[], y: readonly number[]): number[] {
  const n = y.length;
  const out = new Array<number>(n).fill(0);
  p.forEach((row, k) => {
    const yk = y[k]!;
    for (let i = 0; i < n; i++) out[i]! += row[i]! * yk;
  });
  return out;
}
