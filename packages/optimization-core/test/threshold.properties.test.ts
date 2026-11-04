import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  DomainValidationError,
  GaussianAnalyticOptimizer,
  GaussianScoreModel,
  optimizeThreshold,
  SRO1_THRESHOLD_EXAMPLE,
} from '../src';
import { expectAbs } from './helpers';

const optimizer = new GaussianAnalyticOptimizer();

const gaussianInput = fc.record({
  genuine: fc.record({
    mean: fc.double({ min: 0.5, max: 0.95, noNaN: true }),
    std: fc.double({ min: 0.03, max: 0.2, noNaN: true }),
  }),
  impostor: fc.record({
    mean: fc.double({ min: 0.05, max: 0.45, noNaN: true }),
    std: fc.double({ min: 0.03, max: 0.2, noNaN: true }),
  }),
  costs: fc.record({
    cFA: fc.double({ min: 0.1, max: 1000, noNaN: true }),
    cFR: fc.double({ min: 0.1, max: 100, noNaN: true }),
  }),
});

describe('свойства оптимизатора порога (нормальные распределения)', () => {
  it('P4/P5: невырожденный оптимум стационарен, является минимумом и подтверждается численно', () => {
    fc.assert(
      fc.property(gaussianInput, (input) => {
        const r = optimizer.optimize(input);
        if (r.optimal.degenerate !== null) return;
        const tau = r.optimal.tau!;
        const m = new GaussianScoreModel(input.genuine, input.impostor);
        const E = (t: number) => input.costs.cFA * m.far(t) + input.costs.cFR * m.frr(t);
        const dE = input.costs.cFR * m.genuinePdf(tau) - input.costs.cFA * m.impostorPdf(tau);
        const scale = input.costs.cFR * m.genuinePdf(tau) + input.costs.cFA * m.impostorPdf(tau);
        expect(Math.abs(dE)).toBeLessThanOrEqual(1e-9 * Math.max(1, scale));
        expect(E(tau - 1e-4)).toBeGreaterThanOrEqual(r.optimal.cost);
        expect(E(tau + 1e-4)).toBeGreaterThanOrEqual(r.optimal.cost);
        expect(r.optimal.cost).toBeLessThanOrEqual(Math.min(input.costs.cFA, input.costs.cFR));
        expect(r.verification.status).toBe('ok');
      }),
      { numRuns: 1000 },
    );
  });

  it('P6: в точке EER FAR = FRR', () => {
    fc.assert(
      fc.property(gaussianInput, (input) => {
        const r = optimizer.optimize(input);
        expect(Math.abs(r.eer.far - r.eer.frr)).toBeLessThanOrEqual(1e-12 * Math.max(r.eer.far, 1e-300));
      }),
      { numRuns: 500 },
    );
  });

  it('P9: детерминизм — повторный расчёт даёт побайтно одинаковый JSON', () => {
    const a = JSON.stringify(
      optimizeThreshold({
        model: { kind: 'gaussian', ...SRO1_THRESHOLD_EXAMPLE },
        costs: SRO1_THRESHOLD_EXAMPLE.costs,
      }),
    );
    const b = JSON.stringify(
      optimizeThreshold({
        model: { kind: 'gaussian', ...SRO1_THRESHOLD_EXAMPLE },
        costs: SRO1_THRESHOLD_EXAMPLE.costs,
      }),
    );
    expect(a).toBe(b);
  });
});

describe('граничные случаи порога', () => {
  const base = SRO1_THRESHOLD_EXAMPLE;

  it('σ_G = σ_I — линейное уравнение вместо квадратного', () => {
    const input = {
      genuine: { mean: 0.7, std: 0.1 },
      impostor: { mean: 0.3, std: 0.1 },
      costs: { cFA: 10, cFR: 1 },
    };
    const r = optimizer.optimize(input);
    // При равных σ: τ* = (μ_G + μ_I)/2 + σ²·ln(cFA/cFR)/(μ_G − μ_I)
    expectAbs(r.optimal.tau, 0.5 + (0.01 * Math.log(10)) / 0.4, 1e-12);
    expectAbs(r.eer.tau, 0.5, 1e-15);
    expect(r.verification.status).toBe('ok');
  });

  // Вырожденный случай возникает, только когда у уравнения стационарности нет корней (D < 0).
  // При cFA = 1e-6 конечный порог ещё выгоднее: в дальнем хвосте FRR убывает быстрее FAR.
  it('конечный порог выгоднее «допускать всех», пока D ≥ 0 (cFA = 1e-6)', () => {
    const r = optimizer.optimize({ ...base, costs: { cFA: 1e-6, cFR: 1 } });
    expect(r.optimal.degenerate).toBeNull();
    expect(r.optimal.cost).toBeLessThan(1e-6);
    expect(r.verification.status).toBe('ok');
  });

  it('D < 0 при σ_G > σ_I и cFA = 1e-12 — вырожденное решение «допускать всех»', () => {
    const r = optimizer.optimize({
      genuine: { mean: 0.72, std: 0.11 },
      impostor: { mean: 0.3, std: 0.09 },
      costs: { cFA: 1e-12, cFR: 1 },
    });
    expect(r.optimal.degenerate).toBe('acceptAll');
    expect(r.optimal.tau).toBeNull();
    expect(r.verification.status).toBe('skipped');
    expect(r.warnings.length).toBeGreaterThan(0);
  });

  it('D < 0 при σ_G < σ_I и cFR = 1e-12 — вырожденное решение «отвергать всех»', () => {
    const r = optimizer.optimize({ ...base, costs: { cFA: 1, cFR: 1e-12 } });
    expect(r.optimal.degenerate).toBe('rejectAll');
    expect(r.optimal.far).toBe(0);
    expect(r.optimal.frr).toBe(1);
  });

  it('регрессия: корень в дальнем хвосте, неотличимый от «отвергать всех», считается вырожденным', () => {
    // Найдено property-тестом P4: E(τ≈2,8) меньше cFR лишь на ~1e-39, численная проверка не сходилась → HTTP 500.
    const cases = [
      {
        genuine: { mean: 0.5, std: 0.17863845985300694 },
        impostor: { mean: 0.45, std: 0.17555974475589173 },
        costs: { cFA: 120.32486353370145, cFR: 0.14897545285327154 },
      },
      {
        genuine: { mean: 0.5, std: 0.2 },
        impostor: { mean: 0.3476715875900269, std: 0.1932318891995079 },
        costs: { cFA: 464.59794247654725, cFR: 0.1 },
      },
      {
        genuine: { mean: 0.5, std: 0.12216332309143697 },
        impostor: { mean: 0.45, std: 0.12272556757015513 },
        costs: { cFA: 331.62167361020454, cFR: 7.114604689950118 },
      },
    ];
    for (const input of cases) {
      const r = optimizer.optimize(input);
      expect(r.optimal.degenerate).toBe('rejectAll');
      expect(r.optimal.cost).toBe(input.costs.cFR);
      expect(r.verification.status).toBe('skipped');
    }
  });

  it('FAR_max делает безусловный оптимум недопустимым → τ* = τ_min, FAR(τ*) = FAR_max', () => {
    const r = optimizer.optimize({ ...base, farMax: 1e-4 });
    expect(r.optimal.constrainedByFarMax).toBe(true);
    expect(Math.abs(r.optimal.far - 1e-4)).toBeLessThan(1e-4 * 1e-10);
    expect(r.optimal.tau!).toBeGreaterThan(0.5818);
    expect(r.verification.status).toBe('ok');
    expect(r.warnings).toContain('Точка равных ошибок не удовлетворяет ограничению FAR ≤ FAR_max.');
  });

  it('нестрогое FAR_max не меняет оптимум, если он и так допустим', () => {
    const r = optimizer.optimize({ ...base, farMax: 0.01 });
    expect(r.optimal.constrainedByFarMax).toBe(false);
    expectAbs(r.optimal.tau, 0.581785716220834, 1e-9);
  });

  it('некорректные входы отклоняются', () => {
    expect(() => optimizer.optimize({ ...base, genuine: { mean: 0.2, std: 0.1 } })).toThrow(
      DomainValidationError,
    );
    expect(() => optimizer.optimize({ ...base, genuine: { mean: 0.7, std: 0 } })).toThrow(
      DomainValidationError,
    );
    expect(() => optimizer.optimize({ ...base, costs: { cFA: -1, cFR: 1 } })).toThrow(DomainValidationError);
    expect(() => optimizer.optimize({ ...base, farMax: 1 })).toThrow(DomainValidationError);
  });

  it('кривые: заданный диапазон и число точек, ROC согласована с FRR', () => {
    const { curves } = optimizeThreshold({
      model: { kind: 'gaussian', genuine: base.genuine, impostor: base.impostor },
      costs: base.costs,
      curve: { from: 0.3, to: 0.8, points: 101 },
    });
    expect(curves.errors).toHaveLength(101);
    expect(curves.errors[0]!.tau).toBe(0.3);
    expect(curves.errors[100]!.tau).toBe(0.8);
    curves.errors.forEach((p, i) => expect(curves.roc[i]!.tar).toBeCloseTo(1 - p.frr, 15));
  });
});
