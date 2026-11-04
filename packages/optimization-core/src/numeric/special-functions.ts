/**
 * Обёртки над проверенными реализациями спецфункций из @stdlib (ADR-0008).
 * Вероятности хвостов вычисляются только через erfc, без выражения вида 1 − Φ(z),
 * чтобы не терять точность при FAR ~ 1e-6 … 1e-15.
 */
import stdlibErfc from '@stdlib/math-base-special-erfc';
import stdlibErfcinv from '@stdlib/math-base-special-erfcinv';
import stdlibExpm1 from '@stdlib/math-base-special-expm1';
import stdlibLog1p from '@stdlib/math-base-special-log1p';

export const SQRT2 = Math.SQRT2;
const INV_SQRT_2PI = 1 / Math.sqrt(2 * Math.PI);

export const erfc = (x: number): number => stdlibErfc(x);
export const erfcinv = (x: number): number => stdlibErfcinv(x);
export const log1p = (x: number): number => stdlibLog1p(x);
export const expm1 = (x: number): number => stdlibExpm1(x);

/** P(X ≥ x) для X ~ N(mean, std), точно в правом хвосте. */
export function normalUpperTail(x: number, mean: number, std: number): number {
  return 0.5 * erfc((x - mean) / (std * SQRT2));
}

/** P(X < x) для X ~ N(mean, std), точно в левом хвосте. */
export function normalLowerTail(x: number, mean: number, std: number): number {
  return 0.5 * erfc((mean - x) / (std * SQRT2));
}

/** Плотность N(mean, std). */
export function normalPdf(x: number, mean: number, std: number): number {
  const z = (x - mean) / std;
  return (INV_SQRT_2PI / std) * Math.exp(-0.5 * z * z);
}
