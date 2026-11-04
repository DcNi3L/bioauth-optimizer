import { describe, expect, it } from 'vitest';
import {
  budgetSweepRequestSchema,
  factorSelectionRequestSchema,
  thresholdOptimizeRequestSchema,
  z,
} from '../src';

const factor = { code: 'F1', name: 'Лицо', far: 1e-4, frr: 0.02, latencyMs: 350, cost: 1, hasPad: true };

describe('контракты', () => {
  it('порог: значения по умолчанию и проверка средних', () => {
    const ok = thresholdOptimizeRequestSchema.parse({
      model: { kind: 'gaussian', genuine: { mean: 0.72, std: 0.09 }, impostor: { mean: 0.3, std: 0.11 } },
      costs: { cFA: 10, cFR: 1 },
    });
    expect(ok.constraints.farMax).toBeNull();
    const bad = thresholdOptimizeRequestSchema.safeParse({
      model: { kind: 'gaussian', genuine: { mean: 0.2, std: 0.09 }, impostor: { mean: 0.3, std: 0.11 } },
      costs: { cFA: 10, cFR: 1 },
    });
    expect(bad.success).toBe(false);
    expect(bad.error!.issues[0]!.path).toEqual(['model', 'genuine', 'mean']);
  });

  it('лишние поля отклоняются (защита от mass assignment)', () => {
    const r = thresholdOptimizeRequestSchema.safeParse({
      model: { kind: 'empirical', datasetId: '3f2504e0-4f89-41d3-9a0c-0305e82c3301', extra: 1 },
      costs: { cFA: 1, cFR: 1 },
    });
    expect(r.success).toBe(false);
  });

  it('факторы: повтор кода и выбор ровно одного источника', () => {
    const dup = factorSelectionRequestSchema.safeParse({
      factors: [factor, factor],
      costs: { cFA: 1, cFR: 1 },
      constraints: {},
    });
    expect(dup.success).toBe(false);
    expect(z.prettifyError(dup.error!)).toContain('повторяется');
    const none = factorSelectionRequestSchema.safeParse({ costs: { cFA: 1, cFR: 1 }, constraints: {} });
    expect(none.success).toBe(false);
    const ok = factorSelectionRequestSchema.parse({ factors: [factor], costs: { cFA: 1, cFR: 1 }, constraints: {} });
    expect(ok.solver).toBe('auto');
    expect(ok.constraints.minPadFactors).toBe(1);
    expect(ok.rankingLimit).toBe(100);
  });

  it('перебор бюджета: не более 500 точек', () => {
    const r = budgetSweepRequestSchema.safeParse({
      factors: [factor],
      costs: { cFA: 1, cFR: 1 },
      constraints: {},
      sweep: { from: 0, to: 100, step: 0.1 },
    });
    expect(r.success).toBe(false);
  });

  it('схемы конвертируются в JSON Schema для Swagger', () => {
    const schema = z.toJSONSchema(factorSelectionRequestSchema, { io: 'input', unrepresentable: 'any' });
    expect(schema.type).toBe('object');
  });
});
