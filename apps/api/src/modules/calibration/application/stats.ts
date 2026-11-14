/** Статистика для калибровки и испытаний (чистые функции, проверяются unit-тестами). */

const Z95 = 1.959963984540054;

/** Двусторонний 95%-интервал Уилсона для доли k/n. */
export function wilson(k: number, n: number, z = Z95): [number, number] {
  if (n <= 0) return [0, 1];
  const p = k / n;
  const z2 = z * z;
  const denom = 1 + z2 / n;
  const center = (p + z2 / (2 * n)) / denom;
  const half = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / denom;
  // При k = 0 и k = n границы точно 0 и 1 (без погрешности округления).
  return [k === 0 ? 0 : Math.max(0, center - half), k === n ? 1 : Math.min(1, center + half)];
}

/**
 * Верхняя 95%-граница FAR по n сравнениям злоумышленников с k ложными допусками:
 * при k = 0 — «правило трёх» 3/n (docs/10 §10.7), иначе верхняя граница Уилсона.
 */
export function confirmedRate(k: number, n: number): number {
  if (n <= 0) return 1;
  return k === 0 ? Math.min(1, 3 / n) : wilson(k, n)[1];
}

/**
 * Наименьший порог, при котором верхняя 95%-граница FAR (правило трёх / Уилсон) не выше цели; допуск при s ≥ τ.
 * Нужен для открытых наборов: распределение злоумышленников переносимо на другую камеру, а genuine-оценки
 * студийных снимков — нет, поэтому порог берётся у нижней границы допустимого FAR, а не в середине зазора.
 * null — сравнений слишком мало, чтобы подтвердить цель даже без ложных допусков.
 */
export function farTargetThreshold(negatives: Scores, targetFar: number): number | null {
  const n = negatives.length;
  if (confirmedRate(0, n) > targetFar) return null;
  const desc = Array.from(negatives).sort((a, b) => b - a);
  let k = 0; // сколько злоумышленников допустимо пропустить
  while (k + 1 < n && confirmedRate(k + 1, n) <= targetFar) k++;
  // Ровно k оценок ≥ τ: τ чуть выше (k+1)-й по величине; округление вверх до 4 знаков.
  return Math.ceil((desc[k]! + 1e-9) * 1e4) / 1e4;
}

export interface OperatingPoint {
  readonly tau: number;
  readonly far: number;
  readonly frr: number;
  readonly cost: number;
  readonly falseAccepts: number;
}

/** Эмпирические ошибки при пороге τ (допуск при s ≥ τ — как в ядре v1). */
type Scores = readonly number[] | Float64Array;

export function pointAt(
  positives: Scores,
  negatives: Scores,
  tau: number,
  costs: { cFA: number; cFR: number },
): OperatingPoint {
  let fa = 0;
  for (const s of negatives) if (s >= tau) fa++;
  let fr = 0;
  for (const s of positives) if (s < tau) fr++;
  const far = negatives.length ? fa / negatives.length : 0;
  const frr = positives.length ? fr / positives.length : 0;
  return { tau, far, frr, cost: costs.cFA * far + costs.cFR * frr, falseAccepts: fa };
}

/** Квантиль по линейной интерполяции (как percentile_cont). */
export function quantile(values: readonly number[], q: number): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo]! + (s[hi]! - s[lo]!) * (pos - lo);
}

/** z-статистика отклонения доли k/n от p0 (биномиально); NaN, если p0 вырождено. */
export function binomialZ(k: number, n: number, p0: number): number {
  if (n <= 0 || p0 <= 0 || p0 >= 1) return Number.NaN;
  return (k / n - p0) / Math.sqrt((p0 * (1 - p0)) / n);
}
