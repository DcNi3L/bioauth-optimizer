import { assertDomain } from '../../errors';
import { leq } from '../../numeric';
import { toSortedFloat64 } from '../empirical-score-model';
import type { EmpiricalThresholdInput, OperatingPoint, OptimalPoint, ThresholdResult } from '../types';
import { validateCosts, validateFarMax } from '../validation';
import type { ThresholdOptimizer } from './threshold-optimizer';

const TIE_RELATIVE = 1e-12;

interface SweepPoint {
  /** Индекс кандидата: 0…m−1 — уникальные оценки, m — «+∞» (отвергать всех). */
  readonly k: number;
  readonly far: number;
  readonly frr: number;
  readonly cost: number;
}

/**
 * Точный поиск порога по эмпирическим оценкам (док. 02, §2.1.2).
 * E(τ) кусочно-постоянна и меняется только в значениях оценок, поэтому перебор всех уникальных
 * значений двумя указателями даёт точный глобальный минимум за O((n_G + n_I)·log).
 */
export class EmpiricalSweepOptimizer implements ThresholdOptimizer<EmpiricalThresholdInput> {
  optimize(input: EmpiricalThresholdInput): ThresholdResult {
    validateCosts(input.costs);
    validateFarMax(input.farMax);
    assertDomain(input.genuine.length > 0, 'нет оценок законных пользователей', 'genuine');
    assertDomain(input.impostor.length > 0, 'нет оценок злоумышленников', 'impostor');
    const G = toSortedFloat64(input.genuine);
    const I = toSortedFloat64(input.impostor);
    assertDomain(
      Number.isFinite(G[0]!) && Number.isFinite(G[G.length - 1]!),
      'оценки должны быть конечными',
      'genuine',
    );
    assertDomain(
      Number.isFinite(I[0]!) && Number.isFinite(I[I.length - 1]!),
      'оценки должны быть конечными',
      'impostor',
    );

    const { cFA, cFR } = input.costs;
    const farMax = input.farMax ?? null;
    const nG = G.length;
    const nI = I.length;
    const thresholds = uniqueMerged(G, I);
    const m = thresholds.length;

    let pg = 0;
    let pi = 0;
    let best: SweepPoint | null = null;
    let eer: SweepPoint | null = null;
    let eerGap = Infinity;

    const consider = (p: SweepPoint) => {
      const gap = Math.abs(p.far - p.frr);
      if (gap < eerGap) {
        eerGap = gap;
        eer = p;
      }
      if (farMax !== null && !leq(p.far, farMax)) return;
      if (best === null || isBetter(p, best)) best = p;
    };

    for (let k = 0; k < m; k++) {
      const t = thresholds[k]!;
      while (pg < nG && G[pg]! < t) pg++;
      while (pi < nI && I[pi]! < t) pi++;
      const far = (nI - pi) / nI;
      const frr = pg / nG;
      consider({ k, far, frr, cost: cFA * far + cFR * frr });
    }
    consider({ k: m, far: 0, frr: 1, cost: cFR }); // τ = +∞

    const bestPoint = best as SweepPoint | null;
    const eerPoint = eer as SweepPoint | null;
    if (bestPoint === null || eerPoint === null) {
      throw new Error('empirical sweep: нет допустимого порога (не должно происходить)');
    }

    const describe = (p: SweepPoint) => {
      const lower = p.k === 0 ? null : thresholds[p.k - 1]!;
      const upper = p.k === m ? null : thresholds[p.k]!;
      const tau = upper === null ? null : lower === null ? upper : lower + (upper - lower) / 2;
      const degenerate: OptimalPoint['degenerate'] = p.k === m ? 'rejectAll' : p.k === 0 ? 'acceptAll' : null;
      return { tau, interval: [lower, upper] as const, degenerate };
    };

    const eerDesc = describe(eerPoint);
    const eerOp: OperatingPoint = {
      tau: eerDesc.tau,
      far: eerPoint.far,
      frr: eerPoint.frr,
      cost: cFA * eerPoint.far + cFR * eerPoint.frr,
    };
    const optDesc = describe(bestPoint);
    const optimal: OptimalPoint = {
      tau: optDesc.tau,
      far: bestPoint.far,
      frr: bestPoint.frr,
      cost: bestPoint.cost,
      interval: optDesc.interval,
      degenerate: optDesc.degenerate,
      constrainedByFarMax: false,
    };

    const warnings: string[] = [];
    if (farMax !== null && nI < 3 / farMax) {
      warnings.push(
        `Злоумышленников в выборке ${nI}: этого недостаточно, чтобы подтвердить FAR ≤ ${farMax} (по «правилу трёх» нужно не менее ${Math.ceil(3 / farMax)}).`,
      );
    }
    if (optimal.far === 0 && optimal.degenerate !== 'rejectAll') {
      warnings.push(
        `На выборке FAR = 0; верхняя 95%-я граница истинного FAR ≈ ${(3 / nI).toExponential(2)}.`,
      );
    }
    if (optimal.degenerate === 'rejectAll')
      warnings.push('Оптимально отвергать всех: порог не имеет смысла.');
    if (optimal.degenerate === 'acceptAll')
      warnings.push('Оптимально допускать всех: порог не имеет смысла.');

    return {
      method: 'empirical-sweep',
      eer: eerOp,
      optimal,
      lossReduction: eerOp.cost > 0 ? 1 - optimal.cost / eerOp.cost : null,
      verification: { status: 'exact', numericTau: null, absDiff: null },
      warnings,
      sampleSizes: { genuine: nG, impostor: nI },
    };
  }
}

/** Ничья по E разрешается в пользу меньшего FAR (приоритет безопасности), затем меньшего τ. */
function isBetter(p: SweepPoint, q: SweepPoint): boolean {
  const tol = TIE_RELATIVE * Math.max(Math.abs(p.cost), Math.abs(q.cost));
  if (p.cost < q.cost - tol) return true;
  if (p.cost > q.cost + tol) return false;
  if (p.far !== q.far) return p.far < q.far;
  return p.k < q.k;
}

function uniqueMerged(a: Float64Array, b: Float64Array): Float64Array {
  const out = new Float64Array(a.length + b.length);
  let i = 0;
  let j = 0;
  let n = 0;
  let last = NaN;
  while (i < a.length || j < b.length) {
    const takeA = j >= b.length || (i < a.length && a[i]! <= b[j]!);
    const v = takeA ? a[i++]! : b[j++]!;
    if (n === 0 || v !== last) {
      out[n++] = v;
      last = v;
    }
  }
  return out.subarray(0, n);
}
