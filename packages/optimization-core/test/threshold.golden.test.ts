import { describe, expect, it } from 'vitest';

import { GaussianAnalyticOptimizer, numeric, SRO1_THRESHOLD_EXAMPLE } from '../src';
import fixtures from './fixtures/threshold-scipy.json';
import { expectAbs, expectRel } from './helpers';

const optimizer = new GaussianAnalyticOptimizer();

describe('G-T1 — модельный пример раздела 4 СРО1', () => {
  const r = optimizer.optimize(SRO1_THRESHOLD_EXAMPLE);

  it('точка равных ошибок: τ_EER = 0,531, FAR = FRR = 1,786 %, E = 0,1965', () => {
    expectAbs(r.eer.tau, 0.531, 1e-12);
    expectRel(r.eer.far, 0.017864420562817, 1e-12);
    expectRel(r.eer.frr, 0.017864420562817, 1e-12);
    expectRel(r.eer.cost, 0.196508626190982, 1e-12);
  });

  it('оптимальный порог: τ* = 0,5818, FAR = 0,521 %, FRR = 6,230 %, E = 0,1144', () => {
    expectAbs(r.optimal.tau, 0.581785716220834, 1e-9);
    expectRel(r.optimal.far, 0.00520823745159, 1e-9);
    expectRel(r.optimal.frr, 0.062304237539322, 1e-9);
    expectRel(r.optimal.cost, 0.114386612055219, 1e-12);
    expect(r.optimal.degenerate).toBeNull();
  });

  it('снижение ожидаемых потерь Δ = 41,8 %', () => {
    expectAbs(r.lossReduction, 0.41790539, 1e-8);
  });

  it('аналитический оптимум подтверждён численно', () => {
    expect(r.verification.status).toBe('ok');
    expect(r.verification.absDiff!).toBeLessThan(1e-9);
  });
});

describe('G-T2 — 50 случайных задач против SciPy', () => {
  it.each(fixtures.cases.map((c, i) => [i, c] as const))('случай %i', (_i, c) => {
    const r = optimizer.optimize({ genuine: c.genuine, impostor: c.impostor, costs: c.costs });
    expectAbs(r.eer.tau, c.expected.tauEer, 1e-12);
    expectRel(r.eer.far, c.expected.farEer, 1e-11);
    expectRel(r.eer.cost, c.expected.costEer, 1e-11);
    expectAbs(r.optimal.tau, c.expected.tauOpt, 1e-9);
    expectRel(r.optimal.far, c.expected.farOpt, 1e-7);
    expectRel(r.optimal.frr, c.expected.frrOpt, 1e-7);
    expectRel(r.optimal.cost, c.expected.costOpt, 1e-12);
    expect(r.verification.status).toBe('ok');
  });
});

describe('G-T3 — точность хвостов (без 1 − Φ)', () => {
  it.each(fixtures.tails.map((t) => [t.z, t.upperTail] as const))('Q(%d)', (z, expected) => {
    expectRel(numeric.normalUpperTail(z, 0, 1), expected, 1e-12);
    expectRel(numeric.normalLowerTail(-z, 0, 1), expected, 1e-12);
  });
});
