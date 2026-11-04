/**
 * Бисекция корня непрерывной функции на [a, b] при f(a)·f(b) ≤ 0.
 * Останавливается, когда интервал перестаёт сжиматься в арифметике double.
 */
export function bisect(f: (x: number) => number, a: number, b: number, maxIter = 200): number {
  let lo = a;
  let hi = b;
  let flo = f(lo);
  if (flo === 0) return lo;
  const fhi = f(hi);
  if (fhi === 0) return hi;
  if (Math.sign(flo) === Math.sign(fhi)) {
    throw new RangeError('bisect: на концах интервала функция одного знака');
  }
  for (let i = 0; i < maxIter; i++) {
    const mid = lo + (hi - lo) / 2;
    if (mid <= lo || mid >= hi) break;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (Math.sign(fm) === Math.sign(flo)) {
      lo = mid;
      flo = fm;
    } else {
      hi = mid;
    }
  }
  return lo + (hi - lo) / 2;
}
