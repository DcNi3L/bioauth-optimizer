import type { z } from '@bioauth/contracts';
import { Injectable, type PipeTransform } from '@nestjs/common';

/** Ошибка валидации запроса со списком нарушений по путям. */
export class RequestValidationError extends Error {
  override name = 'RequestValidationError';
  constructor(readonly issues: { path: string; message: string }[]) {
    super(issues[0]?.message ?? 'Некорректные входные данные');
  }
}

export function issuesFromZod(error: z.ZodError): { path: string; message: string }[] {
  return error.issues.map((i) => ({ path: i.path.map(String).join('.') || '(root)', message: i.message }));
}

/** Валидация тела/параметров той же zod-схемой, что и на фронтенде (ADR-0009). */
@Injectable()
export class ZodValidationPipe<S extends z.ZodType> implements PipeTransform<unknown, z.output<S>> {
  constructor(private readonly schema: S) {}

  transform(value: unknown): z.output<S> {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) throw new RequestValidationError(issuesFromZod(parsed.error));
    return parsed.data;
  }
}

/** Проверка UUID в параметрах пути. */
@Injectable()
export class UuidPipe implements PipeTransform<string, string> {
  transform(value: string): string {
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
      throw new RequestValidationError([{ path: 'id', message: 'ожидается UUID' }]);
    }
    return value.toLowerCase();
  }
}
