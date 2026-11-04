import type { FactorSelectionProblem } from '../factor-selection/types';
import type { GaussianThresholdInput } from '../threshold/types';

/**
 * Модельный пример раздела 4 статьи СРО1 (Мекенбаев Д. К., «Многокритериальная оптимизация параметров
 * систем биометрической аутентификации»). Признак PAD восстановлен по рис. 2б: PAD имеют F1 и F2.
 */
export const SRO1_THRESHOLD_EXAMPLE: GaussianThresholdInput = {
  genuine: { mean: 0.72, std: 0.09 },
  impostor: { mean: 0.3, std: 0.11 },
  costs: { cFA: 10, cFR: 1 },
  farMax: null,
};

export const SRO1_FACTOR_EXAMPLE: FactorSelectionProblem = {
  factors: [
    {
      code: 'F1',
      name: 'Лицо (ArcFace) + PAD',
      far: 1e-4,
      frr: 0.02,
      latencyMs: 350,
      cost: 1.0,
      hasPad: true,
    },
    { code: 'F2', name: 'Отпечаток пальца', far: 5e-5, frr: 0.015, latencyMs: 250, cost: 0.6, hasPad: true },
    { code: 'F3', name: 'Голос', far: 5e-3, frr: 0.06, latencyMs: 900, cost: 0.4, hasPad: false },
    {
      code: 'F4',
      name: 'Поведенческая биометрия',
      far: 2e-2,
      frr: 0.05,
      latencyMs: 60,
      cost: 0.3,
      hasPad: false,
    },
    {
      code: 'F5',
      name: 'Аутентификатор FIDO2',
      far: 1e-6,
      frr: 0.005,
      latencyMs: 400,
      cost: 1.5,
      hasPad: false,
    },
  ],
  costs: { cFA: 10, cFR: 1 },
  constraints: { latencyMaxMs: 1000, budget: 2.5, farMax: 1e-6, minPadFactors: 1 },
  fusionRule: 'AND',
};
