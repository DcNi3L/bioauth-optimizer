export interface Costs {
  /** Стоимость ложного допуска cFA > 0. */
  readonly cFA: number;
  /** Стоимость ложного отказа cFR > 0. */
  readonly cFR: number;
}

/** Параметры нормального распределения; std — стандартное отклонение (не дисперсия). */
export interface NormalParams {
  readonly mean: number;
  readonly std: number;
}

export interface OperatingPoint {
  /** Порог τ (правило допуска s ≥ τ); null — вырожденное решение «отвергать всех». */
  readonly tau: number | null;
  readonly far: number;
  readonly frr: number;
  /** Байесовская стоимость E(τ) = cFA·FAR + cFR·FRR. */
  readonly cost: number;
}

export type Degenerate = 'acceptAll' | 'rejectAll';

export interface OptimalPoint extends OperatingPoint {
  /** Эмпирический режим: решения одинаковы для τ ∈ (lower, upper]; null — граница отсутствует. */
  readonly interval: readonly [number | null, number | null] | null;
  readonly degenerate: Degenerate | null;
  /** Оптимум лежит на границе τ_min, заданной ограничением FAR ≤ FAR_max. */
  readonly constrainedByFarMax: boolean;
}

export type VerificationStatus = 'ok' | 'mismatch' | 'skipped' | 'exact';

export interface ThresholdVerification {
  readonly status: VerificationStatus;
  readonly numericTau: number | null;
  readonly absDiff: number | null;
}

export type ThresholdMethod = 'gaussian-analytic' | 'empirical-sweep';

export interface ThresholdResult {
  readonly method: ThresholdMethod;
  readonly eer: OperatingPoint;
  readonly optimal: OptimalPoint;
  /** Δ = 1 − E(τ*)/E(τ_EER); null, если E(τ_EER) = 0. */
  readonly lossReduction: number | null;
  readonly verification: ThresholdVerification;
  readonly warnings: readonly string[];
  readonly sampleSizes: { readonly genuine: number; readonly impostor: number } | null;
}

export interface GaussianThresholdInput {
  readonly genuine: NormalParams;
  readonly impostor: NormalParams;
  readonly costs: Costs;
  readonly farMax?: number | null;
}

export interface EmpiricalThresholdInput {
  readonly genuine: ArrayLike<number>;
  readonly impostor: ArrayLike<number>;
  readonly costs: Costs;
  readonly farMax?: number | null;
}

export interface ErrorCurvePoint {
  readonly tau: number;
  readonly far: number;
  readonly frr: number;
  readonly cost: number;
}

export interface RocPoint {
  readonly far: number;
  /** TAR = 1 − FRR. */
  readonly tar: number;
}

export interface ThresholdCurves {
  readonly errors: readonly ErrorCurvePoint[];
  readonly roc: readonly RocPoint[];
}

export interface CurveRange {
  readonly from: number;
  readonly to: number;
  readonly points: number;
}
