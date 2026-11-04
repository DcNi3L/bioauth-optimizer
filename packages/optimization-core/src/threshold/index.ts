import { CurveBuilder } from './curves';
import { EmpiricalScoreModel } from './empirical-score-model';
import { GaussianScoreModel } from './gaussian-score-model';
import { EmpiricalSweepOptimizer } from './optimizers/empirical-sweep.optimizer';
import { GaussianAnalyticOptimizer } from './optimizers/gaussian-analytic.optimizer';
import type { Costs, CurveRange, NormalParams, ThresholdCurves, ThresholdResult } from './types';

export * from './bayes-cost';
export * from './curves';
export * from './empirical-score-model';
export * from './gaussian-score-model';
export * from './optimizers/empirical-sweep.optimizer';
export * from './optimizers/gaussian-analytic.optimizer';
export type * from './optimizers/threshold-optimizer';
export type * from './score-model';
export type * from './types';
export * from './verification/numeric-verifier';

export type ThresholdModelInput =
  | { readonly kind: 'gaussian'; readonly genuine: NormalParams; readonly impostor: NormalParams }
  | { readonly kind: 'empirical'; readonly genuine: ArrayLike<number>; readonly impostor: ArrayLike<number> };

export interface OptimizeThresholdInput {
  readonly model: ThresholdModelInput;
  readonly costs: Costs;
  readonly farMax?: number | null;
  readonly curve?: Partial<CurveRange>;
}

export interface OptimizeThresholdOutput {
  readonly result: ThresholdResult;
  readonly curves: ThresholdCurves;
}

const DEFAULT_CURVE_POINTS = 200;

/** Фасад модуля «Порог»: выбирает стратегию по виду модели и строит кривые. */
export function optimizeThreshold(input: OptimizeThresholdInput): OptimizeThresholdOutput {
  const curves = new CurveBuilder();
  const points = input.curve?.points ?? DEFAULT_CURVE_POINTS;
  if (input.model.kind === 'gaussian') {
    const { genuine, impostor } = input.model;
    const result = new GaussianAnalyticOptimizer().optimize({
      genuine,
      impostor,
      costs: input.costs,
      farMax: input.farMax,
    });
    const range: CurveRange = {
      from: input.curve?.from ?? impostor.mean - 3 * impostor.std,
      to: input.curve?.to ?? genuine.mean + 3 * genuine.std,
      points,
    };
    return { result, curves: curves.build(new GaussianScoreModel(genuine, impostor), input.costs, range) };
  }
  const model = EmpiricalScoreModel.fromSamples(input.model.genuine, input.model.impostor);
  const result = new EmpiricalSweepOptimizer().optimize({
    genuine: model.genuineSorted,
    impostor: model.impostorSorted,
    costs: input.costs,
    farMax: input.farMax,
  });
  const lo = Math.min(model.genuineSorted[0]!, model.impostorSorted[0]!);
  const hi = Math.max(
    model.genuineSorted[model.genuineSorted.length - 1]!,
    model.impostorSorted[model.impostorSorted.length - 1]!,
  );
  const pad = hi > lo ? 0 : 1;
  const range: CurveRange = { from: input.curve?.from ?? lo - pad, to: input.curve?.to ?? hi + pad, points };
  return { result, curves: curves.build(model, input.costs, range) };
}
