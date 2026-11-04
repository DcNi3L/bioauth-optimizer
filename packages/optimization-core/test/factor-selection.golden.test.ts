import { describe, expect, it } from 'vitest';

import {
  budgetSweep,
  CertifiedIlpSolver,
  ExhaustiveSolver,
  type FactorSelectionProblem,
  HighsMilpAdapter,
  solveFactorSelection,
  SRO1_FACTOR_EXAMPLE,
} from '../src';
import { expectRel } from './helpers';

const exhaustive = new ExhaustiveSolver();
const ilp = new CertifiedIlpSolver(new HighsMilpAdapter());
const withBudget = (budget: number): FactorSelectionProblem => ({
  ...SRO1_FACTOR_EXAMPLE,
  constraints: { ...SRO1_FACTOR_EXAMPLE.constraints, budget },
});

// Таблица §2.3 документа 02 (совпадает с рис. 2б СРО1).
const EXPECTED_RANKING = [
  { codes: ['F2', 'F5'], far: 5e-11, frr: 0.019925, latencyMs: 650, cost: 2.1, objective: 0.0199250005 },
  { codes: ['F1', 'F5'], far: 1e-10, frr: 0.0249, latencyMs: 750, cost: 2.5, objective: 0.024900001 },
  { codes: ['F1', 'F2'], far: 5e-9, frr: 0.0347, latencyMs: 600, cost: 1.6, objective: 0.03470005 },
  { codes: ['F2', 'F4'], far: 1e-6, frr: 0.06425, latencyMs: 310, cost: 0.9, objective: 0.06426 },
  {
    codes: ['F2', 'F4', 'F5'],
    far: 1e-12,
    frr: 0.06892875,
    latencyMs: 710,
    cost: 2.4,
    objective: 0.06892875001,
  },
  { codes: ['F1', 'F2', 'F4'], far: 1e-10, frr: 0.082965, latencyMs: 660, cost: 1.9, objective: 0.082965001 },
];

describe('G-F1 — пример статьи, B = 2,5', () => {
  const r = exhaustive.solveSync(SRO1_FACTOR_EXAMPLE);

  it('31 подмножество, 6 допустимых, оптимум F2+F5', () => {
    expect(r.status).toBe('optimal');
    expect(r.stats.subsetsTotal).toBe(31);
    expect(r.stats.feasibleCount).toBe(6);
    expect(r.rankingComplete).toBe(true);
    expect(r.optimum!.codes).toEqual(['F2', 'F5']);
  });

  it('рейтинг и метрики совпадают с таблицей статьи', () => {
    expect(r.ranking.map((s) => s.codes)).toEqual(EXPECTED_RANKING.map((e) => e.codes));
    r.ranking.forEach((s, i) => {
      const e = EXPECTED_RANKING[i]!;
      expectRel(s.far, e.far, 1e-12);
      expectRel(s.frr, e.frr, 1e-12);
      expectRel(s.objective, e.objective, 1e-12);
      expect(s.latencyMs).toBe(e.latencyMs);
      expectRel(s.cost, e.cost, 1e-12);
    });
  });

  it('в оптимуме активно только ограничение PAD; задержка неактивна (как в статье)', () => {
    expect(r.optimum!.activeConstraints).toEqual(['minPadFactors']);
    expect(r.optimum!.slack.latencyMs).toBe(350);
  });

  it('статистика отсечений по ограничениям', () => {
    expect(r.stats.rejectedBy).toEqual({ latency: 15, budget: 8, pad: 7, far: 6 });
  });
});

describe('G-F2 — пример статьи, B = 2,0', () => {
  it('3 допустимых, оптимум F1+F2, рост E в 1,74 раза', () => {
    const r = exhaustive.solveSync(withBudget(2.0));
    expect(r.stats.feasibleCount).toBe(3);
    expect(r.optimum!.codes).toEqual(['F1', 'F2']);
    expectRel(r.optimum!.objective, 0.03470005, 1e-12);
    const base = exhaustive.solveSync(SRO1_FACTOR_EXAMPLE).optimum!.objective;
    expectRel(r.optimum!.objective / base, 0.03470005 / 0.0199250005, 1e-12);
    expect((r.optimum!.objective / base).toFixed(2)).toBe('1.74');
  });
});

describe('G-F3 — регрессия плавающей точки (ADR-0008)', () => {
  it('F2+F4 с FAR = 5e-5·2e-2 = 1e-6 допустим при FAR_max = 1e-6', () => {
    expect(5e-5 * 2e-2 > 1e-6).toBe(true); // наивное сравнение ошиблось бы
    const r = exhaustive.solveSync(SRO1_FACTOR_EXAMPLE);
    const f2f4 = r.ranking.find((s) => s.codes.join('+') === 'F2+F4');
    expect(f2f4).toBeDefined();
    expect(f2f4!.activeConstraints).toContain('farMax');
  });
});

describe('G-F4 — сертифицированное ЦЛП (метод СРО1)', () => {
  it('2 итерации, нижняя оценка 0,068929 (FRR тройки F2+F4+F5), оптимум доказан и совпадает с перебором', async () => {
    const r = await ilp.solve(SRO1_FACTOR_EXAMPLE);
    expect(r.optimum!.codes).toEqual(['F2', 'F5']);
    expectRel(r.optimum!.objective, 0.0199250005, 1e-12);
    expect(r.solver.used).toBe('ilp');
    expect(r.solver.certificate!.iterations).toBe(2);
    expect(r.solver.certificate!.proven).toBe(true);
    expectRel(r.solver.certificate!.lowerBound, 0.06892875, 1e-7);
    expect(r.rankingComplete).toBe(false);
  });

  it('при B = 2,0 ЦЛП тоже находит F1+F2', async () => {
    const r = await ilp.solve(withBudget(2.0));
    expect(r.optimum!.codes).toEqual(['F1', 'F2']);
  });
});

describe('G-F5 — анализ чувствительности к бюджету', () => {
  it('точки смены оптимума: 0,9 → F2+F4, 1,6 → F1+F2, 2,1 → F2+F5', () => {
    const r = budgetSweep(SRO1_FACTOR_EXAMPLE, { from: 0.5, to: 3.0, step: 0.1 });
    expect(r.points).toHaveLength(26);
    const bp = r.breakpoints.map((b) => [b.budget, b.codes?.join('+') ?? null]);
    expect(bp).toEqual([
      [0.5, null],
      [0.9, 'F2+F4'],
      [1.6, 'F1+F2'],
      [2.1, 'F2+F5'],
    ]);
    expectRel(r.breakpoints[2]!.ratioToPrevious, 0.03470005 / 0.06426, 1e-10);
    expectRel(r.breakpoints[3]!.ratioToPrevious, 0.0199250005 / 0.03470005, 1e-10);
  });
});

describe('фасад solveFactorSelection', () => {
  it('auto выбирает полный перебор при n ≤ 20', async () => {
    const r = await solveFactorSelection(SRO1_FACTOR_EXAMPLE);
    expect(r.solver.used).toBe('exhaustive');
  });
});
