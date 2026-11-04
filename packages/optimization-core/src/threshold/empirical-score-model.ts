import type { ScoreModel } from './score-model';

/** Число элементов отсортированного массива, строго меньших x. */
export function countLess(sorted: Float64Array, x: number): number {
  let lo = 0;
  let hi = sorted.length;
  while (lo < hi) {
    const mid = (lo + hi) >>> 1;
    if ((sorted[mid] as number) < x) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

export function toSortedFloat64(values: ArrayLike<number>): Float64Array {
  return Float64Array.from(values).sort();
}

/** Эмпирическая модель по выборкам оценок (массивы должны быть отсортированы по возрастанию). */
export class EmpiricalScoreModel implements ScoreModel {
  constructor(
    readonly genuineSorted: Float64Array,
    readonly impostorSorted: Float64Array,
  ) {}

  static fromSamples(genuine: ArrayLike<number>, impostor: ArrayLike<number>): EmpiricalScoreModel {
    return new EmpiricalScoreModel(toSortedFloat64(genuine), toSortedFloat64(impostor));
  }

  far(tau: number): number {
    const n = this.impostorSorted.length;
    return (n - countLess(this.impostorSorted, tau)) / n;
  }

  frr(tau: number): number {
    return countLess(this.genuineSorted, tau) / this.genuineSorted.length;
  }
}
