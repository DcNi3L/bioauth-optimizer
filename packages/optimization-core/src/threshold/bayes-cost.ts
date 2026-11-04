import type { ScoreModel } from './score-model';
import type { Costs } from './types';

/** Формула (1) СРО1: E(τ) = cFA·FAR(τ) + cFR·FRR(τ). */
export function bayesCost(model: ScoreModel, costs: Costs, tau: number): number {
  return costs.cFA * model.far(tau) + costs.cFR * model.frr(tau);
}
