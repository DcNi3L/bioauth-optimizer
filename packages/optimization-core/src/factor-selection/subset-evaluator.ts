import { isTight, leq, leqLog } from '../numeric';
import { AndFusionRule } from './fusion/and-fusion.rule';
import type { FusionRule, PreparedFusion } from './fusion/fusion-rule';
import type {
  ConstraintKind,
  ConstraintName,
  FactorSelectionProblem,
  SubsetMetrics,
  SubsetSolution,
} from './types';

export interface Violations {
  readonly latency: boolean;
  readonly budget: boolean;
  readonly pad: boolean;
  readonly far: boolean;
}

/**
 * Единственная ответственность — вычислить метрики подмножества и проверить допустимость (ограничения (3) СРО1).
 * Используется обоими решателями, поэтому их результаты сравнимы побитово.
 */
export class SubsetEvaluator {
  private readonly fusion: PreparedFusion;
  private readonly logFarMax: number | null;

  constructor(
    readonly problem: FactorSelectionProblem,
    fusionRule: FusionRule = new AndFusionRule(),
  ) {
    this.fusion = fusionRule.prepare(problem.factors);
    this.logFarMax = problem.constraints.farMax === null ? null : Math.log(problem.constraints.farMax);
  }

  evaluate(indices: readonly number[]): SubsetMetrics {
    const { factors, costs } = this.problem;
    const fused = this.fusion.combine(indices);
    let latencyMs = 0;
    let cost = 0;
    let padCount = 0;
    let frrSum = 0;
    for (const i of indices) {
      const f = factors[i]!;
      latencyMs += f.latencyMs;
      cost += f.cost;
      frrSum += f.frr;
      if (f.hasPad) padCount++;
    }
    return {
      indices,
      far: fused.far,
      logFar: fused.logFar,
      frr: fused.frr,
      frrSum,
      latencyMs,
      cost,
      padCount,
      objective: costs.cFA * fused.far + costs.cFR * fused.frr,
    };
  }

  violations(m: SubsetMetrics): Violations {
    const c = this.problem.constraints;
    return {
      latency: c.latencyMaxMs !== null && !leq(m.latencyMs, c.latencyMaxMs),
      budget: c.budget !== null && !leq(m.cost, c.budget),
      pad: m.padCount < c.minPadFactors,
      far: this.logFarMax !== null && !leqLog(m.logFar, this.logFarMax),
    };
  }

  isFeasible(m: SubsetMetrics): boolean {
    if (m.indices.length === 0) return false;
    const v = this.violations(m);
    return !(v.latency || v.budget || v.pad || v.far);
  }

  toSolution(m: SubsetMetrics): SubsetSolution {
    const c = this.problem.constraints;
    const slack = {
      latencyMs: c.latencyMaxMs === null ? null : c.latencyMaxMs - m.latencyMs,
      budget: c.budget === null ? null : c.budget - m.cost,
      logFar: this.logFarMax === null ? null : this.logFarMax - m.logFar,
      minPadFactors: c.minPadFactors > 0 ? m.padCount - c.minPadFactors : null,
    };
    const active: ConstraintName[] = [];
    if (slack.latencyMs !== null && isTight(slack.latencyMs, c.latencyMaxMs!)) active.push('latencyMaxMs');
    if (slack.budget !== null && isTight(slack.budget, c.budget!)) active.push('budget');
    if (slack.logFar !== null && isTight(slack.logFar, 1)) active.push('farMax');
    if (slack.minPadFactors === 0) active.push('minPadFactors');
    return {
      codes: m.indices.map((i) => this.problem.factors[i]!.code),
      far: m.far,
      frr: m.frr,
      latencyMs: m.latencyMs,
      cost: m.cost,
      padCount: m.padCount,
      objective: m.objective,
      activeConstraints: active,
      slack,
    };
  }
}

export const CONSTRAINT_KINDS: readonly ConstraintKind[] = ['latency', 'budget', 'pad', 'far'];

/**
 * Детерминированный порядок наборов (NFR-5): E ↑, FAR ↑, стоимость ↑, задержка ↑, затем коды лексикографически.
 */
export function compareSubsets(a: SubsetMetrics, b: SubsetMetrics, codeOf: (i: number) => string): number {
  if (a.objective !== b.objective) return a.objective - b.objective;
  if (a.far !== b.far) return a.far - b.far;
  if (a.cost !== b.cost) return a.cost - b.cost;
  if (a.latencyMs !== b.latencyMs) return a.latencyMs - b.latencyMs;
  const ka = a.indices.map(codeOf).join('+');
  const kb = b.indices.map(codeOf).join('+');
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

export function indicesFromMask(mask: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) if (mask & (1 << i)) out.push(i);
  return out;
}
