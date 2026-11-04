/** Ошибки прикладного слоя; ProblemDetailsFilter переводит их в RFC 7807. */
export class ValidationError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(message);
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends Error {
  override name = 'NotFoundError';
}

export class ConflictError extends Error {
  override name = 'ConflictError';
}

/** Ни один вариант не удовлетворяет ограничениям (HTTP 422). */
export class InfeasibleProblemError extends Error {
  override name = 'InfeasibleProblemError';
  constructor(
    message: string,
    readonly extra: Record<string, unknown>,
  ) {
    super(message);
  }
}

/** Внутренняя проверка корректности расчёта не сошлась (HTTP 500, логируется как ошибка). */
export class InternalConsistencyError extends Error {
  override name = 'InternalConsistencyError';
}
