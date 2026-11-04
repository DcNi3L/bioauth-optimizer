import type { ProblemDetails, z } from '@bioauth/contracts';

import { API_BASE } from '../config';

/** Ошибка API в формате RFC 7807 — с пояснением и нарушениями по полям. */
export class ApiError extends Error {
  constructor(readonly problem: ProblemDetails) {
    super(problem.detail ?? problem.title);
    this.name = 'ApiError';
  }

  get status(): number {
    return this.problem.status;
  }

  /** Сообщение для поля по пути вида «model.genuine.mean». */
  fieldError(path: string): string | undefined {
    return this.problem.errors?.find((e) => e.path === path)?.message;
  }
}

async function handle<T>(res: Response, schema?: z.ZodType<T>): Promise<T> {
  if (res.status === 204) return undefined as T;
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const problem =
      body && typeof body === 'object' && 'status' in body
        ? (body as ProblemDetails)
        : { type: 'network', title: 'Сервер недоступен', status: res.status, detail: `HTTP ${res.status}` };
    throw new ApiError(problem);
  }
  // Ответ проверяется той же схемой из @bioauth/contracts, что и на сервере (ADR-0009).
  return schema ? schema.parse(body) : (body as T);
}

function networkError(err: unknown): never {
  if (err instanceof ApiError) throw err;
  throw new ApiError({
    type: 'network',
    title: 'Нет связи с сервером',
    status: 0,
    detail: 'Проверьте, что API запущен',
  });
}

export async function apiGet<T>(path: string, schema?: z.ZodType<T>): Promise<T> {
  const res = await fetch(API_BASE + path, { headers: { accept: 'application/json' } }).catch(networkError);
  return handle(res, schema);
}

export async function apiSend<T>(
  method: 'POST' | 'PUT' | 'DELETE',
  path: string,
  body?: unknown,
  schema?: z.ZodType<T>,
): Promise<T> {
  const res = await fetch(API_BASE + path, {
    method,
    headers: { 'content-type': 'application/json', accept: 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(networkError);
  return handle(res, schema);
}

export async function apiUpload<T>(path: string, form: FormData, schema?: z.ZodType<T>): Promise<T> {
  const res = await fetch(API_BASE + path, { method: 'POST', body: form }).catch(networkError);
  return handle(res, schema);
}
