import { factorSelectionRequestSchema, thresholdOptimizeRequestSchema } from '@bioauth/contracts';
import { createDefaultSolverSelector, SRO1_FACTOR_EXAMPLE } from '@bioauth/optimization-core';

import type {
  ExperimentPageQuery,
  ExperimentRecord,
  ExperimentRepository,
  NewExperiment,
} from '../../src/modules/experiments/application/experiment.repository';
import { ListExperimentsUseCase } from '../../src/modules/experiments/application/experiment-queries';
import { ExperimentRecorder } from '../../src/modules/experiments/application/experiment-recorder';
import { experimentHeadline } from '../../src/modules/experiments/application/headline';
import { SolveFactorSelectionUseCase } from '../../src/modules/factor-selection/application/solve-factor-selection.use-case';
import { OptimizeThresholdUseCase } from '../../src/modules/threshold/application/optimize-threshold.use-case';
import { InfeasibleProblemError, NotFoundError, ValidationError } from '../../src/shared/errors';

/** Заглушка порта хранилища — use cases тестируются без БД (DIP). */
class InMemoryExperiments implements ExperimentRepository {
  readonly rows: ExperimentRecord[] = [];
  private seq = 0;

  save(e: NewExperiment) {
    const createdAt = new Date(Date.UTC(2026, 10, 4, 0, 0, this.seq));
    const id = `00000000-0000-4000-8000-${String(++this.seq).padStart(12, '0')}`;
    this.rows.push({ ...e, id, createdAt });
    return Promise.resolve({ id, createdAt });
  }

  findById(id: string) {
    return Promise.resolve(this.rows.find((r) => r.id === id) ?? null);
  }

  list(q: ExperimentPageQuery) {
    const rows = [...this.rows]
      .filter((r) => !q.type || r.type === q.type)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : -1))
      .filter(
        (r) =>
          !q.after ||
          r.createdAt < q.after.createdAt ||
          (r.createdAt.getTime() === q.after.createdAt.getTime() && r.id < q.after.id),
      )
      .slice(0, q.limit);
    return Promise.resolve(rows);
  }
}

describe('use cases с заглушками портов', () => {
  const repo = new InMemoryExperiments();
  const recorder = new ExperimentRecorder(repo);

  it('OptimizeThreshold: пример статьи сохраняется с хэшем входа и версией ядра', async () => {
    const uc = new OptimizeThresholdUseCase({ findSamples: () => Promise.resolve(null) }, recorder);
    const cmd = thresholdOptimizeRequestSchema.parse({
      model: { kind: 'gaussian', genuine: { mean: 0.72, std: 0.09 }, impostor: { mean: 0.3, std: 0.11 } },
      costs: { cFA: 10, cFR: 1 },
    });
    const r = await uc.execute(cmd);
    expect(r.optimal.tau).toBeCloseTo(0.581785716220834, 12);
    const saved = await repo.findById(r.experimentId);
    expect(saved!.inputHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved!.coreVersion).toBe('1.0.0');
    expect(experimentHeadline(saved!)).toContain('τ* = 0,5818');
  });

  it('OptimizeThreshold: неизвестный набор оценок → NotFoundError', async () => {
    const uc = new OptimizeThresholdUseCase({ findSamples: () => Promise.resolve(null) }, recorder);
    const cmd = thresholdOptimizeRequestSchema.parse({
      model: { kind: 'empirical', datasetId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301' },
      costs: { cFA: 1, cFR: 1 },
    });
    await expect(uc.execute(cmd)).rejects.toThrow(NotFoundError);
  });

  it('SolveFactorSelection: факторы из каталога; недопустимая задача → 422 с experimentId', async () => {
    const reader = { findFactors: () => Promise.resolve(SRO1_FACTOR_EXAMPLE.factors.map((f) => ({ ...f }))) };
    const uc = new SolveFactorSelectionUseCase(createDefaultSolverSelector(), reader, recorder);
    const base = {
      catalogId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301',
      costs: { cFA: 10, cFR: 1 },
      constraints: { latencyMaxMs: 1000, budget: 2.5, farMax: 1e-6, minPadFactors: 1 },
    };
    const ok = await uc.execute(factorSelectionRequestSchema.parse(base));
    expect(ok.optimum!.codes).toEqual(['F2', 'F5']);
    const saved = await repo.findById(ok.experimentId);
    expect((saved!.input as { factors: unknown[] }).factors).toHaveLength(5); // копия факторов
    expect(saved!.factorCatalogId).toBe(base.catalogId);

    const bad = factorSelectionRequestSchema.parse({
      ...base,
      constraints: { ...base.constraints, latencyMaxMs: 1 },
    });
    const err = await uc.execute(bad).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(InfeasibleProblemError);
    const experimentId = (err as InfeasibleProblemError).extra.experimentId as string;
    expect((await repo.findById(experimentId))!.status).toBe('INFEASIBLE');
  });

  it('ListExperiments: keyset-пагинация без пропусков и повторов', async () => {
    const list = new ListExperimentsUseCase(repo);
    const seen: string[] = [];
    let cursor: string | undefined;
    do {
      const page = await list.execute({ limit: 1, cursor });
      seen.push(...page.items.map((i) => i.id));
      cursor = page.nextCursor ?? undefined;
    } while (cursor);
    expect(new Set(seen).size).toBe(repo.rows.length);
    expect(seen).toHaveLength(repo.rows.length);
    await expect(list.execute({ limit: 1, cursor: 'мусор' })).rejects.toThrow(ValidationError);
  });
});
