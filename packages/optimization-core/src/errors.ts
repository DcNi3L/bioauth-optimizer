/** Некорректные входные данные для вычислительного ядра (переводится API в HTTP 400). */
export class DomainValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'DomainValidationError';
  }
}

/** Задача слишком велика для выбранного метода (переводится API в HTTP 413). */
export class ProblemTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ProblemTooLargeError';
  }
}

export function assertDomain(condition: boolean, message: string, path: string): asserts condition {
  if (!condition) throw new DomainValidationError(message, path);
}

export const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
