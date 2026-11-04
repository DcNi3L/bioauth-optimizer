/**
 * Сравнение нестрогих ограничений с допуском (ADR-0008).
 * Без допуска произведение 5e-5 · 2e-2 = 1.0000000000000002e-6 «нарушает» FAR ≤ 1e-6.
 */
export const EPS = 1e-9;

/** lhs ≤ rhs с относительным допуском: lhs ≤ rhs + ε·max(1, |rhs|). */
export function leq(lhs: number, rhs: number, eps: number = EPS): boolean {
  return lhs <= rhs + eps * Math.max(1, Math.abs(rhs));
}

/** lhs ≥ rhs с тем же допуском. */
export function geq(lhs: number, rhs: number, eps: number = EPS): boolean {
  return lhs >= rhs - eps * Math.max(1, Math.abs(rhs));
}

/** Сравнение в логарифмической форме: ln(a) ≤ ln(b) + ε (относительный допуск ε по самим величинам). */
export function leqLog(logLhs: number, logRhs: number, eps: number = EPS): boolean {
  return logLhs <= logRhs + eps;
}

/** Запас ограничения считается нулевым (ограничение активно), если он ≤ ε·max(1, |rhs|). */
export function isTight(slack: number, rhs: number, eps: number = EPS): boolean {
  return Math.abs(slack) <= eps * Math.max(1, Math.abs(rhs));
}
