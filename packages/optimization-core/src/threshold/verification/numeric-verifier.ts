import { bisect } from '../../numeric';
import type { GaussianScoreModel } from '../gaussian-score-model';
import type { Costs, ThresholdVerification } from '../types';

export const VERIFICATION_TOLERANCE = 1e-7;
const GRID_POINTS = 10_000;

/**
 * Независимая проверка аналитического оптимума (ADR-0006):
 * 1) сетка из 10⁴ точек находит глобальный минимум E(τ) грубо;
 * 2) бисекция по производной E′(τ) = cFR·f_G(τ) − cFA·f_I(τ), вычисленной напрямую через плотности
 *    (без квадратного уравнения), уточняет его до машинной точности.
 */
export class NumericVerifier {
  verify(
    model: GaussianScoreModel,
    costs: Costs,
    analyticTau: number,
    tauMin: number,
  ): ThresholdVerification {
    const { genuine: g, impostor: i } = model;
    const spread = Math.max(g.std, i.std);
    let lo = i.mean - 10 * i.std;
    let hi = Math.max(g.mean + 10 * g.std, analyticTau + spread);
    if (Number.isFinite(tauMin)) {
      lo = Math.max(lo, tauMin);
      hi = Math.max(hi, tauMin + 10 * spread);
    }
    const cost = (t: number) => costs.cFA * model.far(t) + costs.cFR * model.frr(t);
    const step = (hi - lo) / (GRID_POINTS - 1);
    let best = 0;
    let bestCost = Infinity;
    for (let k = 0; k < GRID_POINTS; k++) {
      const c = cost(lo + k * step);
      if (c < bestCost) {
        bestCost = c;
        best = k;
      }
    }

    let numericTau: number;
    if (best === 0 && Number.isFinite(tauMin)) {
      numericTau = lo; // минимум на границе τ_min
    } else {
      const derivative = (t: number) => costs.cFR * model.genuinePdf(t) - costs.cFA * model.impostorPdf(t);
      const a = lo + Math.max(0, best - 1) * step;
      const b = lo + Math.min(GRID_POINTS - 1, best + 1) * step;
      const da = derivative(a);
      const db = derivative(b);
      if (best > 0 && best < GRID_POINTS - 1 && da <= 0 && db >= 0 && (da !== 0 || db !== 0)) {
        numericTau = bisect(derivative, a, b);
      } else {
        numericTau = lo + best * step;
      }
    }
    const absDiff = Math.abs(numericTau - analyticTau);
    return { status: absDiff <= VERIFICATION_TOLERANCE ? 'ok' : 'mismatch', numericTau, absDiff };
  }
}
