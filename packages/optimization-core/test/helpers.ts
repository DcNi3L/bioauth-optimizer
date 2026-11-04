import { expect } from 'vitest';

/** |actual − expected| ≤ rel·|expected| (или ≤ rel, если expected = 0). */
export function expectRel(actual: number | null | undefined, expected: number, rel: number): void {
  expect(actual).not.toBeNull();
  expect(actual).toBeTypeOf('number');
  const tol = rel * Math.max(Math.abs(expected), expected === 0 ? 1 : 0);
  expect(Math.abs((actual as number) - expected), `actual=${actual}, expected=${expected}`).toBeLessThanOrEqual(tol);
}

export function expectAbs(actual: number | null | undefined, expected: number, abs: number): void {
  expect(actual).toBeTypeOf('number');
  expect(Math.abs((actual as number) - expected), `actual=${actual}, expected=${expected}`).toBeLessThanOrEqual(abs);
}
