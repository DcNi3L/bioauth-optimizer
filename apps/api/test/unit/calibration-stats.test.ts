import {
  binomialZ,
  confirmedRate,
  pointAt,
  quantile,
  wilson,
} from '../../src/modules/calibration/application/stats';

describe('статистика калибровки', () => {
  it('интервал Уилсона: известные значения и границы', () => {
    const [lo, hi] = wilson(5, 100);
    expect(lo).toBeCloseTo(0.0215, 3); // эталон: Wilson 95 % для 5/100 ≈ [0,0215; 0,1118]
    expect(hi).toBeCloseTo(0.1118, 3);
    expect(wilson(0, 10)[0]).toBe(0);
    expect(wilson(10, 10)[1]).toBeCloseTo(1, 12);
    expect(wilson(0, 0)).toEqual([0, 1]);
  });

  it('подтверждённый FAR: правило трёх без ложных допусков, иначе граница Уилсона', () => {
    expect(confirmedRate(0, 3000)).toBeCloseTo(1e-3, 12); // FAR ≤ 10⁻³ нужно 3000 сравнений (docs/10 §10.7)
    expect(confirmedRate(0, 2)).toBe(1);
    expect(confirmedRate(1, 1000)).toBeCloseTo(wilson(1, 1000)[1], 12);
    expect(confirmedRate(0, 0)).toBe(1);
  });

  it('ошибки при пороге: допуск при s ≥ τ (как в ядре v1)', () => {
    const p = pointAt([0.5, 0.6, 0.7, 0.8], [0.1, 0.5, 0.2, 0.3], 0.5, { cFA: 10, cFR: 1 });
    expect(p).toEqual({ tau: 0.5, far: 0.25, frr: 0, cost: 2.5, falseAccepts: 1 });
    const q = pointAt(Float64Array.from([0.5, 0.6]), [], 0.55, { cFA: 1, cFR: 1 });
    expect(q).toMatchObject({ far: 0, frr: 0.5 });
  });

  it('квантиль и z-статистика', () => {
    expect(quantile([1, 2, 3, 4], 0.5)).toBe(2.5);
    expect(quantile([10], 0.95)).toBe(10);
    expect(quantile([], 0.5)).toBeNull();
    expect(binomialZ(20, 100, 0.1)).toBeCloseTo(10 / 3, 9);
    expect(binomialZ(1, 10, 0)).toBeNaN();
  });
});
