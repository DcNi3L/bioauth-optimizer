import { assertDomain, isFiniteNumber } from '../errors';
import type { ScoreModel } from './score-model';
import type { Costs, CurveRange, ThresholdCurves } from './types';

export const MAX_CURVE_POINTS = 2000;

/** Строит точки FAR/FRR/E(τ) и ROC для графиков (рис. 2а СРО1). Отдельно от ScoreModel (ISP). */
export class CurveBuilder {
  build(model: ScoreModel, costs: Costs, range: CurveRange): ThresholdCurves {
    assertDomain(
      isFiniteNumber(range.from) && isFiniteNumber(range.to),
      'границы графика должны быть числами',
      'curve',
    );
    assertDomain(range.to > range.from, 'curve.to должно быть больше curve.from', 'curve.to');
    assertDomain(
      Number.isInteger(range.points) && range.points >= 2 && range.points <= MAX_CURVE_POINTS,
      `число точек должно быть целым от 2 до ${MAX_CURVE_POINTS}`,
      'curve.points',
    );
    const step = (range.to - range.from) / (range.points - 1);
    const errors = [];
    const roc = [];
    for (let k = 0; k < range.points; k++) {
      const tau = k === range.points - 1 ? range.to : range.from + k * step;
      const far = model.far(tau);
      const frr = model.frr(tau);
      errors.push({ tau, far, frr, cost: costs.cFA * far + costs.cFR * frr });
      roc.push({ far, tar: 1 - frr });
    }
    return { errors, roc };
  }
}
