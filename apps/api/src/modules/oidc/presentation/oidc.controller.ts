import { All, Controller, Get, Header, HttpCode, Inject, Post, Query, Req, Res } from '@nestjs/common';
import { ApiExcludeController } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import {
  type AuthUser,
  hashSessionToken,
  Public,
  readCookie,
  SESSION_COOKIE,
} from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { SESSION_STORE, type SessionStore } from '../../identity/application/ports';
import { KeysService } from '../application/keys.service';
import { AuthorizeFatalError, OAuthError, OidcService, type TokenRequest } from '../application/oidc.service';

type Req2 = Request & { user?: AuthUser };

const str = (v: unknown): string | undefined => (typeof v === 'string' ? v : undefined);

/** Параметры запроса только строками: повторённый параметр (массив) отбрасывается как недопустимый. */
const single = (q: Record<string, unknown>): Record<string, string | undefined> =>
  Object.fromEntries(Object.entries(q).map(([k, v]) => [k, str(v)]));

/** Учётные данные клиента: HTTP Basic (RFC 6749 §2.3.1) или параметры тела запроса. */
function tokenRequest(req: Request): TokenRequest & { token?: string } {
  const body = (req.body ?? {}) as Record<string, unknown>;
  let clientId = str(body.client_id);
  let clientSecret = str(body.client_secret);
  const auth = req.headers.authorization;
  if (auth?.startsWith('Basic ')) {
    const decoded = Buffer.from(auth.slice(6), 'base64').toString('utf8');
    const i = decoded.indexOf(':');
    if (i > 0) {
      try {
        clientId = decodeURIComponent(decoded.slice(0, i));
        clientSecret = decodeURIComponent(decoded.slice(i + 1));
      } catch {
        // некорректное %-кодирование — клиент не аутентифицируется
        clientId = undefined;
        clientSecret = undefined;
      }
    }
  }
  return {
    grantType: str(body.grant_type),
    code: str(body.code),
    redirectUri: str(body.redirect_uri),
    codeVerifier: str(body.code_verifier),
    refreshToken: str(body.refresh_token),
    scope: str(body.scope),
    token: str(body.token),
    clientId,
    clientSecret,
  };
}

/**
 * Конечные точки OpenID Connect (без префикса /api/v1): обнаружение, JWKS, авторизация, токены,
 * userinfo, интроспекция, отзыв, выход. Ответы об ошибках — в формате RFC 6749, не RFC 7807.
 */
@ApiExcludeController()
@Public()
@Controller()
export class OidcController {
  constructor(
    private readonly oidc: OidcService,
    private readonly keys: KeysService,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private oauthError(res: Response, err: unknown): Record<string, unknown> {
    if (err instanceof OAuthError) {
      res.status(err.status);
      if (err.status === 401 && err.error === 'invalid_client')
        res.setHeader('www-authenticate', 'Basic realm="bioauth"');
      if (err.error === 'invalid_token' || err.error === 'insufficient_scope') {
        res.setHeader(
          'www-authenticate',
          `Bearer error="${err.error}", error_description="${encodeURIComponent(err.description)}"`,
        );
      }
      return { error: err.error, error_description: err.description };
    }
    throw err;
  }

  private errorPage(err: AuthorizeFatalError): string {
    const u = new URL('/oauth/error', this.config.RP_ORIGIN);
    u.searchParams.set('error', err.error);
    u.searchParams.set('error_description', err.description);
    return u.toString();
  }

  @Get('.well-known/openid-configuration')
  @Header('cache-control', 'public, max-age=300')
  discovery() {
    return this.oidc.discovery();
  }

  @Get('oidc/jwks')
  @Header('cache-control', 'public, max-age=300')
  jwks() {
    return this.keys.jwks();
  }

  @Get('oidc/authorize')
  async authorize(
    @Query() q: Record<string, unknown>,
    @Req() req: Req2,
    @Res() res: Response,
  ): Promise<void> {
    try {
      res.redirect(302, (await this.oidc.authorize(single(q), req.user ?? null)).redirect);
    } catch (err) {
      if (err instanceof AuthorizeFatalError) {
        res.redirect(302, this.errorPage(err));
        return;
      }
      throw err;
    }
  }

  @Get('oidc/authorize/resume')
  async resume(@Query('request') id: unknown, @Req() req: Req2, @Res() res: Response): Promise<void> {
    try {
      res.redirect(302, (await this.oidc.resume(str(id) ?? '', req.user ?? null)).redirect);
    } catch (err) {
      if (err instanceof AuthorizeFatalError) {
        res.redirect(302, this.errorPage(err));
        return;
      }
      throw err;
    }
  }

  @Post('oidc/token')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  @Header('pragma', 'no-cache')
  async token(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return await this.oidc.token(tokenRequest(req));
    } catch (err) {
      return this.oauthError(res, err);
    }
  }

  @All('oidc/userinfo')
  @Header('cache-control', 'no-store')
  async userinfo(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const auth = req.headers.authorization;
    try {
      return await this.oidc.userinfo(auth?.startsWith('Bearer ') ? auth.slice(7) : null);
    } catch (err) {
      return this.oauthError(res, err);
    }
  }

  @Post('oidc/introspect')
  @HttpCode(200)
  @Header('cache-control', 'no-store')
  async introspect(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      return await this.oidc.introspect(tokenRequest(req));
    } catch (err) {
      return this.oauthError(res, err);
    }
  }

  @Post('oidc/revoke')
  @HttpCode(200)
  async revoke(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    try {
      await this.oidc.revoke(tokenRequest(req));
      return {};
    } catch (err) {
      return this.oauthError(res, err);
    }
  }

  /** RP-Initiated Logout: с действительным id_token_hint — выход сразу, иначе — подтверждение в интерфейсе. */
  @Get('oidc/logout')
  async logout(@Query() q: Record<string, unknown>, @Req() req: Req2, @Res() res: Response): Promise<void> {
    const out = await this.oidc.logoutRedirect(single(q), req.user ?? null);
    if (out.endSession) {
      const token = readCookie(req, SESSION_COOKIE);
      if (token) await this.sessions.deleteByTokenHash(hashSessionToken(token));
      res.clearCookie(SESSION_COOKIE, { path: '/' });
    }
    res.redirect(302, out.redirect);
  }
}
