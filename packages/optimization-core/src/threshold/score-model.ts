/** Модель распределений оценок сходства: только вероятности ошибок при правиле допуска s ≥ τ (ISP). */
export interface ScoreModel {
  /** FAR(τ) = P(s_impostor ≥ τ). */
  far(tau: number): number;
  /** FRR(τ) = P(s_genuine < τ). */
  frr(tau: number): number;
}
