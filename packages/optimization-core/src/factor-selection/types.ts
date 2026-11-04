import type { Costs } from '../threshold/types';

export interface Factor {
  readonly code: string;
  readonly name: string;
  /** FAR_i ∈ (0, 1). */
  readonly far: number;
  /** FRR_i ∈ [0, 1). */
  readonly frr: number;
  readonly latencyMs: number;
  readonly cost: number;
  /** Фактор содержит подсистему обнаружения атак на предъявление (PAD). */
  readonly hasPad: boolean;
}

export interface SelectionConstraints {
  /** L_max, мс; null — без ограничения. */
  readonly latencyMaxMs: number | null;
  /** B, усл. ед.; null — без ограничения. */
  readonly budget: number | null;
  /** FAR_max; null — без ограничения. */
  readonly farMax: number | null;
  /** Минимальное число факторов с PAD (0 — без ограничения). */
  readonly minPadFactors: number;
}

export type FusionRuleId = 'AND';

export interface FactorSelectionProblem {
  readonly factors: readonly Factor[];
  readonly costs: Costs;
  readonly constraints: SelectionConstraints;
  readonly fusionRule?: FusionRuleId;
}

/** Ограничение, отсекающее подмножество (ключи статистики rejectedBy). */
export type ConstraintKind = 'latency' | 'budget' | 'pad' | 'far';

/** Имена ограничений в терминах входных параметров (activeConstraints). */
export type ConstraintName = 'latencyMaxMs' | 'budget' | 'farMax' | 'minPadFactors';

export interface SubsetMetrics {
  /** Индексы выбранных факторов по возрастанию. */
  readonly indices: readonly number[];
  readonly far: number;
  readonly logFar: number;
  readonly frr: number;
  /** S(x) = Σ FRR_i·x_i — линеаризованная целевая функция ЦЛП. */
  readonly frrSum: number;
  readonly latencyMs: number;
  readonly cost: number;
  readonly padCount: number;
  /** E(x) = cFA·FAR(x) + cFR·FRR(x). */
  readonly objective: number;
}

export interface SubsetSolution {
  readonly codes: readonly string[];
  readonly far: number;
  readonly frr: number;
  readonly latencyMs: number;
  readonly cost: number;
  readonly padCount: number;
  readonly objective: number;
  readonly activeConstraints: readonly ConstraintName[];
  readonly slack: {
    readonly latencyMs: number | null;
    readonly budget: number | null;
    /** ln(FAR_max) − ln(FAR(x)). */
    readonly logFar: number | null;
    readonly minPadFactors: number | null;
  };
}

export type SolverId = 'exhaustive' | 'ilp';
export type SolverMode = SolverId | 'auto';

export interface IlpCertificate {
  readonly iterations: number;
  /** Нижняя оценка LB = cFR·(1 − e^{−S}) на момент остановки; null — MILP исчерпал допустимое множество. */
  readonly lowerBound: number | null;
  readonly bestObjective: number | null;
  /** true — оптимальность доказана; false — остановка по лимиту итераций. */
  readonly proven: boolean;
}

export interface SelectionResult {
  readonly status: 'optimal' | 'infeasible';
  readonly optimum: SubsetSolution | null;
  readonly ranking: readonly SubsetSolution[];
  /** Рейтинг содержит все допустимые наборы. */
  readonly rankingComplete: boolean;
  readonly stats: {
    readonly factorsCount: number;
    readonly subsetsTotal: number;
    readonly feasibleCount: number | null;
    readonly rejectedBy: Readonly<Record<ConstraintKind, number>> | null;
  };
  readonly solver: { readonly used: SolverId; readonly certificate: IlpCertificate | null };
}

export interface SolveOptions {
  readonly rankingLimit?: number;
}
