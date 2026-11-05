import { randomBytes } from 'node:crypto';

import type { Role } from '@bioauth/contracts';
import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';

import { sha256Hex } from '../canonical-json';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { ForbiddenError, UnauthorizedError } from '../errors';

/** Пользователь текущего запроса (заполняет AuthGuard). */
export interface AuthUser {
  readonly id: string;
  readonly login: string;
  readonly displayName: string;
  readonly role: Role;
  readonly sessionId: string;
  /** Вход завершён полностью: для сотрудника с passkey — пароль и passkey. */
  readonly mfaComplete: boolean;
  /** Способы проверки текущей сессии (RFC 8176). */
  readonly amr: readonly string[];
  /** Момент входа (создания сессии) — auth_time в ID-токене OIDC. */
  readonly authTime: Date;
}

export const SESSION_COOKIE = 'bioauth_session';
export const SESSION_READER = Symbol('SESSION_READER');

/** Узкий порт чтения сессии для охранника (реализует модуль identity). */
export interface SessionReader {
  findUserByTokenHash(tokenHash: string): Promise<AuthUser | null>;
}

export const newSessionToken = (): string => randomBytes(32).toString('base64url');
export const hashSessionToken = (token: string): string => sha256Hex(token);

const PUBLIC_KEY = 'auth:public';
const ROLES_KEY = 'auth:roles';
const MFA_KEY = 'auth:mfa';

/** Эндпоинт открыт без входа. Все остальные требуют сессию (закрыто по умолчанию). */
export const Public = () => SetMetadata(PUBLIC_KEY, true);
/** Эндпоинт доступен только перечисленным ролям. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
/** Требовать завершённый двухфакторный вход сотрудника (админка, политики). */
export const RequireMfa = () => SetMetadata(MFA_KEY, true);

export const CurrentUser = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthUser => {
  const user = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>().user;
  if (!user) throw new UnauthorizedError('нужен вход');
  return user;
});

export function readCookie(req: Request, name: string): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq > 0 && part.slice(0, eq).trim() === name) return decodeURIComponent(part.slice(eq + 1).trim());
  }
  return undefined;
}

/**
 * Глобальный охранник: сессия из httpOnly cookie, роли, MFA и защита от CSRF
 * (изменяющий запрос с cookie и чужим Origin отклоняется; cookie выставляется с SameSite=Lax).
 */
@Injectable()
export class AuthGuard implements CanActivate {
  private readonly allowedOrigins: Set<string>;

  constructor(
    private readonly reflector: Reflector,
    @Inject(SESSION_READER) private readonly sessions: SessionReader,
    @Inject(APP_CONFIG) config: AppConfig,
  ) {
    this.allowedOrigins = new Set([config.CORS_ORIGIN, config.RP_ORIGIN]);
  }

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const req = ctx.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const targets = [ctx.getHandler(), ctx.getClass()];
    const token = readCookie(req, SESSION_COOKIE);

    if (token && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const origin = req.headers.origin;
      if (origin && !this.allowedOrigins.has(origin)) throw new ForbiddenError('запрос с чужого источника');
    }
    if (token) {
      const user = await this.sessions.findUserByTokenHash(hashSessionToken(token));
      if (user) req.user = user;
    }
    if (this.reflector.getAllAndOverride<boolean>(PUBLIC_KEY, targets)) return true;
    if (!req.user) throw new UnauthorizedError('нужен вход');
    const roles = this.reflector.getAllAndOverride<Role[] | undefined>(ROLES_KEY, targets);
    if (roles && !roles.includes(req.user.role)) throw new ForbiddenError('недостаточно прав');
    if (this.reflector.getAllAndOverride<boolean>(MFA_KEY, targets) && !req.user.mfaComplete) {
      throw new ForbiddenError('нужен вход с passkey');
    }
    return true;
  }
}

export function setSessionCookie(res: Response, token: string, maxAgeMs: number, secure: boolean): void {
  res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'lax', secure, path: '/', maxAge: maxAgeMs });
}

export function clearSessionCookie(res: Response, secure: boolean): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'lax', secure, path: '/' });
}
