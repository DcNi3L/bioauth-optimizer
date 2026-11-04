import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  EmpiricalSweepOptimizer,
  GaussianAnalyticOptimizer,
  GaussianScoreModel,
  optimizeThreshold,
  SRO1_THRESHOLD_EXAMPLE,
} from '../src';

const optimizer = new EmpiricalSweepOptimizer();

/** Детерминированный генератор (mulberry32) + Бокс — Мюллер. */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function normalSample(n: number, mean: number, std: number, rand: () => number): number[] {
  const out: number[] = [];
  while (out.length < n) {
    const u = 1 - rand();
    const v = rand();
    out.push(mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
  }
  return out;
}

/** Эталон «в лоб» O(n²): все пороги из объединения оценок и +∞. */
function bruteForce(G: number[], I: number[], cFA: number, cFR: number) {
  const ts = [...new Set([...G, ...I])].sort((a, b) => a - b);
  let best = cFR; // +∞
  for (const t of ts) {
    const far = I.filter((s) => s >= t).length / I.length;
    const frr = G.filter((s) => s < t).length / G.length;
    best = Math.min(best, cFA * far + cFR * frr);
  }
  return best;
}

describe('эмпирический режим', () => {
  it('P8: алгоритм двух указателей даёт тот же E*, что перебор «в лоб»', () => {
    const scores = fc.array(
      fc.integer({ min: 0, max: 40 }).map((k) => k / 40),
      { minLength: 1, maxLength: 40 },
    );
    fc.assert(
      fc.property(
        scores,
        scores,
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        fc.double({ min: 0.1, max: 50, noNaN: true }),
        (G, I, cFA, cFR) => {
          const r = optimizer.optimize({ genuine: G, impostor: I, costs: { cFA, cFR } });
          expect(r.optimal.cost).toBeCloseTo(bruteForce(G, I, cFA, cFR), 12);
          expect(r.verification.status).toBe('exact');
        },
      ),
      { numRuns: 1000 },
    );
  });

  it('P7: на 2·10⁵ выборок из распределений статьи эмпирический оптимум близок к аналитическому', () => {
    const rand = rng(42);
    const { genuine: g, impostor: i, costs } = SRO1_THRESHOLD_EXAMPLE;
    const G = normalSample(200_000, g.mean, g.std, rand);
    const I = normalSample(200_000, i.mean, i.std, rand);
    const emp = optimizer.optimize({ genuine: G, impostor: I, costs });
    const exact = new GaussianAnalyticOptimizer().optimize(SRO1_THRESHOLD_EXAMPLE);
    expect(Math.abs(emp.optimal.tau! - exact.optimal.tau!)).toBeLessThan(0.02);
    const model = new GaussianScoreModel(g, i);
    const trueCostAtEmp = costs.cFA * model.far(emp.optimal.tau!) + costs.cFR * model.frr(emp.optimal.tau!);
    expect(trueCostAtEmp).toBeLessThanOrEqual(exact.optimal.cost * 1.01);
    expect(emp.sampleSizes).toEqual({ genuine: 200_000, impostor: 200_000 });
  });

  it('интервал оптимальных порогов и рекомендуемый порог — середина интервала', () => {
    const r = optimizer.optimize({
      genuine: [0.6, 0.7, 0.8],
      impostor: [0.1, 0.2, 0.3],
      costs: { cFA: 1, cFR: 1 },
    });
    expect(r.optimal.cost).toBe(0);
    expect(r.optimal.interval).toEqual([0.3, 0.6]);
    expect(r.optimal.tau).toBeCloseTo(0.45, 15);
  });

  it('ничья по E разрешается в пользу меньшего FAR', () => {
    // Порог 0.5: FAR=1/2, FRR=0 → E=0.5; порог 0.9: FAR=0, FRR=1/2 → E=0.5 — выбираем FAR=0.
    const r = optimizer.optimize({ genuine: [0.5, 0.9], impostor: [0.1, 0.6], costs: { cFA: 1, cFR: 1 } });
    expect(r.optimal.far).toBe(0);
  });

  it('все оценки одинаковы и выборка из одного элемента обрабатываются', () => {
    const r1 = optimizer.optimize({ genuine: [0.5], impostor: [0.5], costs: { cFA: 10, cFR: 1 } });
    expect(r1.optimal.degenerate).toBe('rejectAll');
    const r2 = optimizer.optimize({ genuine: [0.5, 0.5], impostor: [0.5], costs: { cFA: 1, cFR: 10 } });
    expect(r2.optimal.degenerate).toBe('acceptAll');
  });

  it('FAR_max: предупреждение о недостаточном объёме выборки злоумышленников', () => {
    const r = optimizer.optimize({
      genuine: [0.7, 0.8],
      impostor: [0.1, 0.2],
      costs: { cFA: 1, cFR: 1 },
      farMax: 1e-3,
    });
    expect(r.warnings.some((w) => w.includes('правилу трёх'))).toBe(true);
    expect(r.optimal.far).toBeLessThanOrEqual(1e-3);
  });

  it('фасад строит кривые по диапазону оценок', () => {
    const { result, curves } = optimizeThreshold({
      model: { kind: 'empirical', genuine: [0.6, 0.7, 0.8], impostor: [0.1, 0.2, 0.3] },
      costs: { cFA: 1, cFR: 1 },
      curve: { points: 11 },
    });
    expect(result.method).toBe('empirical-sweep');
    expect(curves.errors[0]!.tau).toBe(0.1);
    expect(curves.errors[10]!.tau).toBe(0.8);
  });
});
