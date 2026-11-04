/** Линейная задача с бинарными переменными x_0…x_{n−1}: min cᵀx при ограничениях Ax {≤, ≥} b. */
export interface MilpConstraint {
  readonly name: string;
  /** Плотный вектор коэффициентов длины numVars. */
  readonly coeffs: readonly number[];
  readonly sense: '<=' | '>=';
  readonly rhs: number;
}

export interface MilpModel {
  readonly numVars: number;
  readonly objective: readonly number[];
  readonly constraints: readonly MilpConstraint[];
}

export type MilpSolution =
  | { readonly status: 'optimal'; readonly values: readonly number[]; readonly objective: number }
  | { readonly status: 'infeasible' };

/** Порт MILP-решателя (DIP: CertifiedIlpSolver не знает о HiGHS). */
export interface MilpPort {
  solve(model: MilpModel): Promise<MilpSolution>;
}
