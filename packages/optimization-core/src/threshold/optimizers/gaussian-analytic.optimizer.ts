import { assertDomain } from '../../errors';
import { SQRT2, erfcinv } from '../../numeric';
import { GaussianScoreModel } from '../gaussian-score-model';
import { validateCosts, validateFarMax, validateNormal } from '../validation';
import type { GaussianThresholdInput, OperatingPoint, OptimalPoint, ThresholdResult } from '../types';
import { NumericVerifier } from '../verification/numeric-verifier';
import type { ThresholdOptimizer } from './threshold-optimizer';

/** Коэффициенты квадратного уравнения a·τ² + b·τ + c = 0 из условия cFA·f_I(τ) = cFR·f_G(τ) (док. 02, §2.1.1). */
export interface StationarityQuadratic {
  readonly a: number;
  readonly b: number;
  readonly c: number;
}

export function stationarityQuadratic(input: GaussianThresholdInput): StationarityQuadratic {
  const { genuine: g, impostor: i, costs } = input;
  const a = 1 / (2 * g.std ** 2) - 1 / (2 * i.std ** 2);
  const b = i.mean / i.std ** 2 - g.mean / g.std ** 2;
  const c =
    g.mean ** 2 / (2 * g.std ** 2) -
    i.mean ** 2 / (2 * i.std ** 2) +
    Math.log(costs.cFA / costs.cFR) +
    Math.log(g.std / i.std);
  return { a, b, c };
}

/** Вещественные корни, численно устойчивая формула; при a ≈ 0 — линейный случай. */
export function solveQuadratic({ a, b, c }: StationarityQuadratic, scale: number): number[] {
  if (Math.abs(a) <= 1e-12 * scale) {
    return b === 0 ? [] : [-c / b];
  }
  const d = b * b - 4 * a * c;
  if (d < 0) return [];
  const q = -0.5 * (b + (b >= 0 ? 1 : -1) * Math.sqrt(d));
  const roots = [q / a];
  if (q !== 0) roots.push(c / q);
  return roots.sort((x, y) => x - y);
}

/** τ_EER = (μ_I·σ_G + μ_G·σ_I) / (σ_G + σ_I) — замкнутая форма для нормальных распределений. */
export function gaussianEerThreshold(input: Pick<GaussianThresholdInput, 'genuine' | 'impostor'>): number {
  const { genuine: g, impostor: i } = input;
  return (i.mean * g.std + g.mean * i.std) / (g.std + i.std);
}

/** Относительный выигрыш над вырожденным решением, ниже которого конечный порог не имеет практического смысла. */
export const DEGENERATE_RELATIVE = 1e-9;

interface Candidate {
  readonly tau: number | null;
  readonly far: number;
  readonly frr: number;
  readonly cost: number;
  readonly degenerate: OptimalPoint['degenerate'];
  readonly constrainedByFarMax: boolean;
}

export class GaussianAnalyticOptimizer implements ThresholdOptimizer<GaussianThresholdInput> {
  constructor(private readonly verifier: NumericVerifier = new NumericVerifier()) {}

  optimize(input: GaussianThresholdInput): ThresholdResult {
    validateNormal(input.genuine, 'genuine');
    validateNormal(input.impostor, 'impostor');
    validateCosts(input.costs);
    validateFarMax(input.farMax);
    assertDomain(
      input.genuine.mean > input.impostor.mean,
      'среднее оценок законных пользователей должно быть больше среднего злоумышленников',
      'genuine.mean',
    );

    const { costs } = input;
    const farMax = input.farMax ?? null;
    const model = new GaussianScoreModel(input.genuine, input.impostor);
    const point = (tau: number): OperatingPoint => {
      const far = model.far(tau);
      const frr = model.frr(tau);
      return { tau, far, frr, cost: costs.cFA * far + costs.cFR * frr };
    };

    const eer = point(gaussianEerThreshold(input));

    // Ограничение FAR(τ) ≤ FAR_max ⇔ τ ≥ τ_min (FAR монотонно убывает).
    const tauMin =
      farMax === null ? -Infinity : input.impostor.mean + input.impostor.std * SQRT2 * erfcinv(2 * farMax);

    const quad = stationarityQuadratic(input);
    const scale = 1 / (2 * input.genuine.std ** 2) + 1 / (2 * input.impostor.std ** 2);
    // E′(τ) имеет знак −Q(τ); локальный минимум E там, где Q убывает: Q′(τ) = 2aτ + b < 0.
    const localMinima = solveQuadratic(quad, scale).filter((t) => 2 * quad.a * t + quad.b < 0 && t >= tauMin);

    const candidates: Candidate[] = localMinima.map((t) => ({
      ...point(t),
      degenerate: null,
      constrainedByFarMax: false,
    }));
    if (farMax !== null) {
      candidates.push({ ...point(tauMin), degenerate: null, constrainedByFarMax: true });
    } else {
      candidates.push({ tau: null, far: 1, frr: 0, cost: costs.cFA, degenerate: 'acceptAll', constrainedByFarMax: false });
    }
    candidates.push({ tau: null, far: 0, frr: 1, cost: costs.cFR, degenerate: 'rejectAll', constrainedByFarMax: false });

    let best = candidates[0] as Candidate;
    for (const cand of candidates) if (cand.cost < best.cost) best = cand;
    // Корень, который лучше вырожденного решения меньше чем на DEGENERATE_RELATIVE, практически неотличим от него:
    // такой τ лежит в дальнем хвосте, где E(τ) плоская до машинной точности. Сообщаем вырожденное решение.
    const limit = candidates.filter((c) => c.degenerate !== null).reduce((a, b) => (b.cost < a.cost ? b : a));
    if (best.degenerate === null && !best.constrainedByFarMax && best.cost >= limit.cost * (1 - DEGENERATE_RELATIVE)) {
      best = limit;
    }

    const optimal: OptimalPoint = {
      tau: best.tau,
      far: best.far,
      frr: best.frr,
      cost: best.cost,
      interval: null,
      degenerate: best.degenerate,
      constrainedByFarMax: best.constrainedByFarMax,
    };

    const verification =
      best.degenerate === null && best.tau !== null
        ? this.verifier.verify(model, costs, best.tau, tauMin)
        : { status: 'skipped' as const, numericTau: null, absDiff: null };

    const warnings: string[] = [];
    if (best.degenerate === 'acceptAll') {
      warnings.push('При заданных стоимостях выгоднее допускать всех: порог не имеет смысла (cFA слишком мала).');
    }
    if (best.degenerate === 'rejectAll') {
      warnings.push('При заданных стоимостях выгоднее отвергать всех: порог не имеет смысла (cFR слишком мала).');
    }
    if (farMax !== null && eer.far > farMax) {
      warnings.push('Точка равных ошибок не удовлетворяет ограничению FAR ≤ FAR_max.');
    }
    if (verification.status === 'mismatch') {
      warnings.push('Численная проверка не подтвердила аналитический оптимум.');
    }

    return {
      method: 'gaussian-analytic',
      eer,
      optimal,
      lossReduction: eer.cost > 0 ? 1 - optimal.cost / eer.cost : null,
      verification,
      warnings,
      sampleSizes: null,
    };
  }
}
