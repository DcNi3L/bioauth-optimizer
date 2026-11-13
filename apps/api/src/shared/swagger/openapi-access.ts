import type { Role } from '@bioauth/contracts';
import { type INestApplication, RequestMethod } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';

/** Требования к вызову операции, собранные из декораторов (@Public, @Roles, @RequireMfa, @Throttle). */
export interface RouteAccess {
  readonly public: boolean;
  readonly roles: readonly Role[] | null;
  readonly mfa: boolean;
  /** Нужна свежая проверка второго фактора (@RequireRecentMfa). */
  readonly stepUp: boolean;
  /** Ограничение частоты: запросов в минуту с одного адреса; null — общий предел сервера. */
  readonly perMinute: number | null;
}

const METHODS: Partial<Record<RequestMethod, string>> = {
  [RequestMethod.GET]: 'get',
  [RequestMethod.POST]: 'post',
  [RequestMethod.PUT]: 'put',
  [RequestMethod.PATCH]: 'patch',
  [RequestMethod.DELETE]: 'delete',
};

const join = (...parts: string[]) =>
  '/' +
  parts
    .flatMap((p) => p.split('/'))
    .filter(Boolean)
    .map((seg) => (seg.startsWith(':') ? `{${seg.slice(1)}}` : seg))
    .join('/');

const list = (v: unknown): string[] =>
  Array.isArray(v) ? (v as string[]) : [typeof v === 'string' ? v : ''];

/**
 * Карта «метод путь» → требования доступа. Строится по тем же метаданным, которые читает AuthGuard,
 * поэтому справочник API не расходится с фактической проверкой прав. Путь — без общего префикса `/api/v1`.
 */
export function collectAccess(app: INestApplication): Map<string, RouteAccess> {
  const out = new Map<string, RouteAccess>();
  for (const module of app.get(ModulesContainer).values()) {
    for (const wrapper of module.controllers.values()) {
      const cls = wrapper.metatype as (new (...a: never[]) => unknown) | null;
      if (!cls) continue;
      const proto = cls.prototype as Record<string, unknown>;
      const meta = (key: string, handler: object): unknown =>
        (Reflect.getMetadata(key, handler) as unknown) ?? (Reflect.getMetadata(key, cls) as unknown);
      for (const name of Object.getOwnPropertyNames(proto)) {
        const handler = proto[name];
        if (name === 'constructor' || typeof handler !== 'function') continue;
        const method = METHODS[Reflect.getMetadata('method', handler) as RequestMethod];
        if (!method) continue;
        const limit = meta('THROTTLER:LIMITdefault', handler);
        const ttl = meta('THROTTLER:TTLdefault', handler);
        const access: RouteAccess = {
          public: meta('auth:public', handler) === true,
          roles: (meta('auth:roles', handler) as Role[] | undefined) ?? null,
          mfa: meta('auth:mfa', handler) === true,
          stepUp: meta('auth:step-up', handler) === true,
          perMinute:
            typeof limit === 'number' && typeof ttl === 'number' ? Math.round((limit * 60_000) / ttl) : null,
        };
        for (const base of list(Reflect.getMetadata('path', cls)))
          for (const sub of list(Reflect.getMetadata('path', handler)))
            out.set(`${method} ${join(base, sub)}`, access);
      }
    }
  }
  return out;
}
