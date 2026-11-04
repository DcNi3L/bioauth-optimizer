import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import type { Request, Response } from 'express';
import { DomainValidationError, ProblemTooLargeError } from '@bioauth/optimization-core';
import { PROBLEM_TYPES, type ProblemDetails } from '@bioauth/contracts';
import {
  ConflictError,
  InfeasibleProblemError,
  InternalConsistencyError,
  NotFoundError,
  ValidationError,
} from '../errors';
import { RequestValidationError } from './zod-validation.pipe';

const TYPE_BASE = 'https://bioauth-optimizer/errors/';

type Mapped = Omit<ProblemDetails, 'instance' | 'requestId' | 'type'> & { type: string; extra?: Record<string, unknown> };

/** Все ошибки → application/problem+json (RFC 7807). Внутренние детали наружу не отдаются. */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  private readonly logger = new Logger('ProblemDetails');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();
    const mapped = this.map(exception);
    if (mapped.status >= 500) {
      this.logger.error({ err: exception, path: req.url }, mapped.title);
    }
    const { extra, ...problem } = mapped;
    res
      .status(mapped.status)
      .type('application/problem+json')
      .json({
        ...problem,
        type: TYPE_BASE + mapped.type,
        instance: req.originalUrl?.split('?')[0],
        requestId: req.id !== undefined ? String(req.id) : undefined,
        ...extra,
      });
  }

  private map(e: unknown): Mapped {
    if (e instanceof RequestValidationError) {
      return { type: PROBLEM_TYPES.validation, title: 'Некорректные входные данные', status: 400, detail: e.message, errors: e.issues };
    }
    if (e instanceof DomainValidationError || e instanceof ValidationError) {
      return {
        type: PROBLEM_TYPES.validation,
        title: 'Некорректные входные данные',
        status: 400,
        detail: e.message,
        errors: [{ path: e.path, message: e.message }],
      };
    }
    if (e instanceof ProblemTooLargeError) {
      return { type: PROBLEM_TYPES.tooLarge, title: 'Задача слишком велика для выбранного метода', status: 413, detail: e.message };
    }
    if (e instanceof InfeasibleProblemError) {
      return { type: PROBLEM_TYPES.infeasible, title: 'Допустимых решений нет', status: 422, detail: e.message, extra: e.extra };
    }
    if (e instanceof NotFoundError) return { type: PROBLEM_TYPES.notFound, title: 'Не найдено', status: 404, detail: e.message };
    if (e instanceof ConflictError) return { type: PROBLEM_TYPES.conflict, title: 'Конфликт', status: 409, detail: e.message };
    if (e instanceof InternalConsistencyError) {
      return { type: PROBLEM_TYPES.internalConsistency, title: 'Ошибка внутренней проверки расчёта', status: 500, detail: e.message };
    }
    if (e instanceof HttpException) {
      const status = e.getStatus();
      const body = e.getResponse();
      const message = typeof body === 'string' ? body : ((body as { message?: string | string[] }).message ?? e.message);
      const detail = Array.isArray(message) ? message.join('; ') : message;
      if (status === HttpStatus.PAYLOAD_TOO_LARGE) {
        return { type: PROBLEM_TYPES.tooLarge, title: 'Слишком большой запрос или файл', status, detail };
      }
      if (status === HttpStatus.NOT_FOUND) return { type: PROBLEM_TYPES.notFound, title: 'Не найдено', status, detail };
      if (status < 500) return { type: PROBLEM_TYPES.validation, title: 'Некорректный запрос', status, detail };
    }
    return { type: PROBLEM_TYPES.internal, title: 'Внутренняя ошибка сервера', status: 500, detail: 'Произошла непредвиденная ошибка' };
  }
}
