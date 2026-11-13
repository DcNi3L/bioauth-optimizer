import fc from 'fast-check';
import { describe, expect, it } from 'vitest';

import {
  CertifiedIlpSolver,
  DomainValidationError,
  ExhaustiveSolver,
  type Factor,
  type FactorSelectionProblem,
  HighsMilpAdapter,
  ProblemTooLargeError,
  SolverSelector,
  SRO1_FACTOR_EXAMPLE,
  toCplexLp,
} from '../src';

const exhaustive = new ExhaustiveSolver();
const ilp = new CertifiedIlpSolver(new HighsMilpAdapter());

const factorArb = (i: number) =>
  fc.record({
    code: fc.constant(`F${i + 1}`),
    name: fc.constant(`Фактор ${i + 1}`),
    far: fc.double({ min: 1e-8, max: 0.2, noNaN: true }),
    frr: fc.oneof(fc.constant(0), fc.double({ min: 1e-4, max: 0.4, noNaN: true })),
    latencyMs: fc.integer({ min: 0, max: 900 }),
    cost: fc.integer({ min: 0, max: 20 }).map((k) => k / 10),
    hasPad: fc.boolean(),
  }) satisfies fc.Arbitrary<Factor>;

const problemArb: fc.Arbitrary<FactorSelectionProblem> = fc.integer({ min: 1, max: 10 }).chain((n) =>
  fc.record({
    factors: fc.tuple(...Array.from({ length: n }, (_, i) => factorArb(i))),
    costs: fc.record({
      cFA: fc.double({ min: 0.1, max: 1e4, noNaN: true }),
      cFR: fc.double({ min: 0.1, max: 100, noNaN: true }),
    }),
    constraints: fc.record({
      latencyMaxMs: fc.option(fc.integer({ min: 0, max: 2500 }), { nil: null }),
      budget: fc.option(
        fc.integer({ min: 0, max: 40 }).map((k) => k / 10),
        { nil: null },
      ),
      farMax: fc.option(fc.double({ min: 1e-12, max: 0.5, noNaN: true }), { nil: null }),
      minPadFactors: fc.integer({ min: 0, max: 2 }),
    }),
  }),
);

describe('свойства решателей состава факторов', () => {
  it('P1: полный перебор и сертифицированное ЦЛП дают одинаковый оптимум', async () => {
    await fc.assert(
      fc.asyncProperty(problemArb, async (problem) => {
        const a = exhaustive.solveSync(problem);
        const b = await ilp.solve(problem);
        expect(b.status).toBe(a.status);
        const ea = a.optimum?.objective ?? 0;
        const eb = b.optimum?.objective ?? 0;
        expect(Math.abs(ea - eb)).toBeLessThanOrEqual(1e-12 * Math.max(1, ea));
        expect(b.solver.certificate!.proven).toBe(true);
      }),
      { numRuns: Number(process.env.P1_RUNS ?? 300) },
    );
  });

  it('P2: ни один допустимый набор из рейтинга не лучше оптимума; рейтинг упорядочен', () => {
    fc.assert(
      fc.property(problemArb, (problem) => {
        const r = exhaustive.solveSync(problem, { rankingLimit: 1000 });
        const sorted = r.ranking.every((s, i) => i === 0 || s.objective >= r.ranking[i - 1]!.objective);
        expect(sorted).toBe(true);
        expect(r.ranking[0] ?? null).toEqual(r.optimum);
        expect(r.ranking.length).toBe(Math.min(1000, r.stats.feasibleCount!));
        expect(r.rankingComplete).toBe(r.stats.feasibleCount! <= 1000);
      }),
      { numRuns: Number(process.env.P2_RUNS ?? 300) },
    );
  });

  it('P3: E*(B) не возрастает при увеличении бюджета', () => {
    fc.assert(
      fc.property(
        problemArb,
        fc.integer({ min: 0, max: 30 }),
        fc.integer({ min: 0, max: 30 }),
        (problem, b1, b2) => {
          const [lo, hi] = [Math.min(b1, b2) / 10, Math.max(b1, b2) / 10];
          const at = (budget: number) =>
            exhaustive.solveSync({ ...problem, constraints: { ...problem.constraints, budget } }).optimum
              ?.objective ?? Infinity;
          expect(at(hi)).toBeLessThanOrEqual(at(lo));
        },
      ),
      { numRuns: 200 },
    );
  });

  it('P9: детерминизм результата', () => {
    expect(JSON.stringify(exhaustive.solveSync(SRO1_FACTOR_EXAMPLE))).toBe(
      JSON.stringify(exhaustive.solveSync(SRO1_FACTOR_EXAMPLE)),
    );
  });
});

describe('граничные случаи', () => {
  const base = SRO1_FACTOR_EXAMPLE;

  it('нет допустимых наборов → infeasible с диагностикой', async () => {
    const problem = { ...base, constraints: { ...base.constraints, latencyMaxMs: 10 } };
    const r = exhaustive.solveSync(problem);
    expect(r.status).toBe('infeasible');
    expect(r.optimum).toBeNull();
    expect(r.stats.rejectedBy!.latency).toBe(31);
    expect((await ilp.solve(problem)).status).toBe('infeasible');
  });

  it('один фактор и фактор с FRR = 0', () => {
    const r = exhaustive.solveSync({
      factors: [{ code: 'K', name: 'Ключ', far: 1e-3, frr: 0, latencyMs: 0, cost: 0, hasPad: false }],
      costs: { cFA: 1, cFR: 1 },
      constraints: { latencyMaxMs: null, budget: null, farMax: null, minPadFactors: 0 },
    });
    expect(r.optimum!.codes).toEqual(['K']);
    expect(r.optimum!.frr).toBe(0);
  });

  it('n = 20: полный перебор укладывается в 2 с, ЦЛП совпадает', async () => {
    const factors: Factor[] = Array.from({ length: 20 }, (_, i) => ({
      code: `F${i + 1}`,
      name: `Фактор ${i + 1}`,
      far: 10 ** -(1 + (i % 5)),
      frr: 0.002 * (1 + ((i * 7) % 13)),
      latencyMs: 50 + ((i * 37) % 300),
      cost: 0.1 * (1 + ((i * 11) % 9)),
      hasPad: i % 4 === 0,
    }));
    const problem: FactorSelectionProblem = {
      factors,
      costs: { cFA: 100, cFR: 1 },
      constraints: { latencyMaxMs: 900, budget: 2.0, farMax: 1e-8, minPadFactors: 1 },
    };
    const t0 = performance.now();
    const a = exhaustive.solveSync(problem);
    const elapsed = performance.now() - t0;
    // Требование — 2 с на машине разработчика; общие раннеры CI медленнее и шумнее (бывает 2,1 с), там запас 50 %.
    expect(elapsed).toBeLessThan(process.env.CI ? 3000 : 2000);
    expect(a.stats.subsetsTotal).toBe(2 ** 20 - 1);
    const b = await ilp.solve(problem);
    expect(b.optimum!.codes).toEqual(a.optimum!.codes);
  });

  it('регрессия: все FRR = 0 — сертификат ЦЛП не вырождается в полный перебор', async () => {
    // Раньше нижняя оценка cFR·(1 − e^{−S}) была равна 0 для всех наборов, и решатель обходил все 2ⁿ − 1 наборов через MILP.
    const factors: Factor[] = Array.from({ length: 12 }, (_, i) => ({
      code: `Z${i}`,
      name: `Ключ ${i}`,
      far: 10 ** -(1 + (i % 4)) * (1 + i / 10),
      frr: 0,
      latencyMs: 10 * i,
      cost: 0.1 * (i % 5),
      hasPad: i % 3 === 0,
    }));
    const problem: FactorSelectionProblem = {
      factors,
      costs: { cFA: 100, cFR: 1 },
      constraints: { latencyMaxMs: 300, budget: 1, farMax: null, minPadFactors: 1 },
    };
    const t0 = performance.now();
    const r = await ilp.solve(problem);
    expect(performance.now() - t0).toBeLessThan(5000);
    expect(r.solver.certificate!.iterations).toBeLessThanOrEqual(3);
    expect(r.solver.certificate!.proven).toBe(true);
    expect(r.optimum!.objective).toBe(exhaustive.solveSync(problem).optimum!.objective);
  });

  it('n = 21 при solver = exhaustive → ProblemTooLargeError; auto → ЦЛП', () => {
    const factors = Array.from({ length: 21 }, (_, i) => ({ ...base.factors[0]!, code: `X${i}` }));
    const selector = new SolverSelector([exhaustive, ilp]);
    expect(() => selector.select(21, 'exhaustive')).toThrow(ProblemTooLargeError);
    expect(selector.select(21, 'auto').id).toBe('ilp');
    expect(() => exhaustive.solveSync({ ...base, factors })).toThrow(ProblemTooLargeError);
  });

  it('валидация входа', () => {
    const bad = (patch: Partial<Factor>) => ({ ...base, factors: [{ ...base.factors[0]!, ...patch }] });
    expect(() => exhaustive.solveSync(bad({ far: 0 }))).toThrow(DomainValidationError);
    expect(() => exhaustive.solveSync(bad({ frr: 1 }))).toThrow(DomainValidationError);
    expect(() => exhaustive.solveSync(bad({ cost: -1 }))).toThrow(DomainValidationError);
    expect(() => exhaustive.solveSync({ ...base, factors: [base.factors[0]!, base.factors[0]!] })).toThrow(
      /повторяется/,
    );
  });

  it('LP-модель для HiGHS: формат CPLEX LP с точными коэффициентами', () => {
    const lp = toCplexLp({
      numVars: 2,
      objective: [0.015, 0.005],
      constraints: [
        { name: 'far', coeffs: [Math.log(5e-5), Math.log(1e-6)], sense: '<=', rhs: Math.log(1e-6) },
      ],
    });
    expect(lp).toContain('obj: 0.015 x0 + 0.005 x1');
    expect(lp).toContain(
      `far: - ${String(-Math.log(5e-5))} x0 - ${String(-Math.log(1e-6))} x1 <= ${String(Math.log(1e-6))}`,
    );
    expect(lp).toContain('Binaries\n x0 x1');
  });
});
