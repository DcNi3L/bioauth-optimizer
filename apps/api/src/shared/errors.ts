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

/** Нет действующей сессии (HTTP 401). */
export class UnauthorizedError extends Error {
  override name = 'UnauthorizedError';
}

/** Сессия есть, но прав недостаточно, или запрос с чужого источника (HTTP 403). */
export class ForbiddenError extends Error {
  override name = 'ForbiddenError';
  constructor(
    message: string,
    readonly code = 'forbidden',
  ) {
    super(message);
  }
}

/** Внешний сервис (bio-engine) недоступен (HTTP 503). */
export class ServiceUnavailableError extends Error {
  override name = 'ServiceUnavailableError';
}

/** Ошибка с машинным кодом и дополнительными полями ответа (например, проблемы качества кадров). */
export class UnprocessableError extends Error {
  override name = 'UnprocessableError';
  constructor(
    message: string,
    readonly code: string,
    readonly extra: Record<string, unknown> = {},
  ) {
    super(message);
  }
}

/** Слишком много попыток (HTTP 429). */
export class TooManyAttemptsError extends Error {
  override name = 'TooManyAttemptsError';
  constructor(
    message: string,
    readonly lockedUntil: Date | null,
  ) {
    super(message);
  }
}
