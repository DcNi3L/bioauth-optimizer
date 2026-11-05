import { randomBytes, randomUUID } from 'node:crypto';

import type { ConnectedAppDto, OauthRequestInfoDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { pkceMatches, safeEqualHex, sha256, signJwt, verifyJwt } from '../../../shared/crypto/jwt';
import { NotFoundError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  LOGIN_EVENTS,
  type LoginEvents,
  USER_REPOSITORY,
  type UserRepository,
} from '../../identity/application/ports';
import { MeQuery } from '../../identity/infrastructure/me.query';
import { KeysService } from './keys.service';
import { type AuthorizeParams, type ClientRecord, OIDC_REPOSITORY, type OidcRepository } from './ports';

/** Ошибка OAuth 2.0 (RFC 6749 §5.2): код, описание, HTTP-статус. */
export class OAuthError extends Error {
  override name = 'OAuthError';
  constructor(
    readonly error: string,
    readonly description: string,
    readonly status = 400,
  ) {
    super(description);
  }
}

/** Ошибка, после которой нельзя перенаправлять на redirect_uri (неизвестный клиент или адрес возврата). */
export class AuthorizeFatalError extends OAuthError {
  override name = 'AuthorizeFatalError';
}

export interface AuthorizeOutcome {
  redirect: string;
}

export interface TokenRequest {
  readonly grantType: string | undefined;
  readonly code?: string;
  readonly redirectUri?: string;
  readonly codeVerifier?: string;
  readonly refreshToken?: string;
  readonly scope?: string;
  readonly clientId?: string;
  readonly clientSecret?: string;
}

const CODE_TTL_MS = 60_000;
const REQUEST_TTL_MS = 10 * 60_000;
const USER_SCOPES = new Set(['openid', 'profile', 'email', 'roles', 'offline_access', 'biometrics']);

const acrOf = (amr: readonly string[]) =>
  amr.includes('face') && amr.includes('hwk')
    ? 'urn:bioauth:loa:face+passkey'
    : amr.includes('face')
      ? 'urn:bioauth:loa:face'
      : amr.includes('hwk')
        ? amr.includes('pwd')
          ? 'urn:bioauth:loa:pwd+passkey'
          : 'urn:bioauth:loa:passkey'
        : 'urn:bioauth:loa:pwd';

/**
 * Сервер авторизации OpenID Connect: Authorization Code + PKCE (S256), refresh-токены с ротацией
 * и обнаружением повторного использования, client credentials, userinfo, отзыв и интроспекция токенов.
 * Вход пользователя — биометрия этой системы: claim amr/acr показывает, как именно он подтверждён.
 */
@Injectable()
export class OidcService {
  constructor(
    @Inject(OIDC_REPOSITORY) private readonly repo: OidcRepository,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(LOGIN_EVENTS) private readonly events: LoginEvents,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly keys: KeysService,
    private readonly me: MeQuery,
  ) {}

  get issuer(): string {
    return (this.config.OIDC_ISSUER ?? this.config.RP_ORIGIN).replace(/\/$/, '');
  }

  /** Адрес интерфейса, куда отправляется пользователь для входа и согласия. */
  private get webOrigin(): string {
    return this.config.RP_ORIGIN.replace(/\/$/, '');
  }

  discovery(): Record<string, unknown> {
    const i = this.issuer;
    return {
      issuer: i,
      authorization_endpoint: `${i}/oidc/authorize`,
      token_endpoint: `${i}/oidc/token`,
      userinfo_endpoint: `${i}/oidc/userinfo`,
      jwks_uri: `${i}/oidc/jwks`,
      revocation_endpoint: `${i}/oidc/revoke`,
      introspection_endpoint: `${i}/oidc/introspect`,
      end_session_endpoint: `${i}/oidc/logout`,
      response_types_supported: ['code'],
      response_modes_supported: ['query'],
      grant_types_supported: ['authorization_code', 'refresh_token', 'client_credentials'],
      subject_types_supported: ['public'],
      id_token_signing_alg_values_supported: ['RS256'],
      token_endpoint_auth_methods_supported: ['client_secret_basic', 'client_secret_post', 'none'],
      code_challenge_methods_supported: ['S256'],
      scopes_supported: [...USER_SCOPES],
      claims_supported: [
        'sub',
        'iss',
        'aud',
        'exp',
        'iat',
        'auth_time',
        'nonce',
        'acr',
        'amr',
        'azp',
        'name',
        'preferred_username',
        'picture',
        'email',
        'email_verified',
        'role',
        'face_enrolled',
        'passkeys',
      ],
      acr_values_supported: [
        'urn:bioauth:loa:face+passkey',
        'urn:bioauth:loa:face',
        'urn:bioauth:loa:pwd+passkey',
        'urn:bioauth:loa:passkey',
        'urn:bioauth:loa:pwd',
      ],
      prompt_values_supported: ['none', 'login', 'consent'],
      authorization_response_iss_parameter_supported: true,
      claims_parameter_supported: false,
      request_parameter_supported: false,
    };
  }

  // ── /authorize ──

  private async activeClient(clientId: string | undefined): Promise<ClientRecord> {
    const client = clientId ? await this.repo.client(clientId) : null;
    if (!client || client.disabled)
      throw new AuthorizeFatalError('invalid_client', 'неизвестный или отключённый клиент');
    return client;
  }

  private redirectWith(uri: string, params: Record<string, string | null>): string {
    const u = new URL(uri);
    for (const [k, v] of Object.entries(params)) if (v !== null) u.searchParams.set(k, v);
    u.searchParams.set('iss', this.issuer);
    return u.toString();
  }

  /** Разбор запроса авторизации; ошибки после проверки клиента и адреса возврата — редиректом (RFC 6749 §4.1.2.1). */
  async authorize(q: Record<string, string | undefined>, user: AuthUser | null): Promise<AuthorizeOutcome> {
    const client = await this.activeClient(q.client_id);
    const redirectUri =
      q.redirect_uri ?? (client.redirectUris.length === 1 ? client.redirectUris[0] : undefined);
    if (!redirectUri || !client.redirectUris.includes(redirectUri)) {
      throw new AuthorizeFatalError('invalid_request', 'redirect_uri не зарегистрирован для этого клиента');
    }
    const state = q.state ?? null;
    const fail = (error: string, description: string) => ({
      redirect: this.redirectWith(redirectUri, { error, error_description: description, state }),
    });
    if (!client.grantTypes.includes('authorization_code'))
      return fail('unauthorized_client', 'клиенту не разрешён код авторизации');
    if (q.response_type !== 'code')
      return fail('unsupported_response_type', 'поддерживается только response_type=code');
    if (q.request || q.request_uri)
      return fail('request_not_supported', 'параметр request не поддерживается');
    const scope = (q.scope ?? '').split(' ').filter(Boolean);
    if (scope.length === 0) return fail('invalid_scope', 'не указан scope');
    const unknown = scope.filter((s) => !client.scopes.includes(s));
    if (unknown.length) return fail('invalid_scope', `scope не разрешён клиенту: ${unknown.join(', ')}`);
    const challenge = q.code_challenge ?? null;
    if (challenge && q.code_challenge_method !== 'S256')
      return fail('invalid_request', 'code_challenge_method должен быть S256');
    if (!challenge && client.secretHash === null)
      return fail('invalid_request', 'публичному клиенту нужен PKCE (code_challenge, S256)');
    if (challenge && !/^[A-Za-z0-9_-]{43}$/.test(challenge))
      return fail('invalid_request', 'некорректный code_challenge');
    const maxAge = q.max_age !== undefined && /^\d+$/.test(q.max_age) ? Number(q.max_age) : null;
    const params: AuthorizeParams = {
      clientId: client.clientId,
      redirectUri,
      scope,
      state,
      nonce: q.nonce ?? null,
      codeChallenge: challenge,
      prompt: q.prompt ?? null,
      maxAge,
    };
    const id = await this.repo.saveRequest(params, new Date(Date.now() + REQUEST_TTL_MS));
    return this.continue(id, params, client, user, true);
  }

  /** Продолжение после входа или согласия: GET /oidc/authorize/resume?request=… */
  async resume(requestId: string, user: AuthUser | null): Promise<AuthorizeOutcome> {
    const params = await this.repo.request(requestId);
    if (!params) throw new AuthorizeFatalError('invalid_request', 'запрос авторизации не найден или истёк');
    const client = await this.activeClient(params.clientId);
    return this.continue(requestId, params, client, user, false);
  }

  private async continue(
    id: string,
    p: AuthorizeParams,
    client: ClientRecord,
    user: AuthUser | null,
    fresh: boolean,
  ): Promise<AuthorizeOutcome> {
    const prompts = (p.prompt ?? '').split(' ');
    const fail = (error: string, description: string) => {
      void this.repo.deleteRequest(id);
      return {
        redirect: this.redirectWith(p.redirectUri, { error, error_description: description, state: p.state }),
      };
    };
    const tooOld = user && p.maxAge !== null && Date.now() - user.authTime.getTime() > p.maxAge * 1000;
    // prompt=login — только при первом заходе: после входа запрос продолжается с новой сессией.
    const needLogin =
      !user ||
      tooOld ||
      (fresh && prompts.includes('login')) ||
      (user.role !== 'subject' && !user.mfaComplete);
    if (needLogin) {
      if (prompts.includes('none')) return fail('login_required', 'нужен вход пользователя');
      return { redirect: `${this.webOrigin}/login?oauth=${id}` };
    }
    const granted = client.firstParty ? p.scope : ((await this.repo.consent(user.id, client.clientId)) ?? []);
    const covered = p.scope.every((s) => granted.includes(s));
    if (!covered || (fresh && prompts.includes('consent') && !client.firstParty)) {
      if (prompts.includes('none')) return fail('consent_required', 'нужно согласие пользователя');
      return { redirect: `${this.webOrigin}/oauth/consent?request=${id}` };
    }
    return this.issueCode(id, p, user);
  }

  private async issueCode(id: string, p: AuthorizeParams, user: AuthUser): Promise<AuthorizeOutcome> {
    const code = randomBytes(32).toString('base64url');
    await this.repo.saveCode(
      sha256(code),
      {
        clientId: p.clientId,
        userId: user.id,
        redirectUri: p.redirectUri,
        scope: p.scope,
        codeChallenge: p.codeChallenge,
        nonce: p.nonce,
        authTime: user.authTime,
        amr: [...user.amr],
      },
      new Date(Date.now() + CODE_TTL_MS),
    );
    await this.repo.deleteRequest(id);
    return { redirect: this.redirectWith(p.redirectUri, { code, state: p.state }) };
  }

  async requestInfo(id: string, user: AuthUser | null): Promise<OauthRequestInfoDto> {
    const p = await this.repo.request(id);
    if (!p) throw new NotFoundError('запрос авторизации не найден или истёк');
    const client = await this.activeClient(p.clientId);
    return {
      id,
      client: {
        clientId: client.clientId,
        name: client.name,
        description: client.description,
        firstParty: client.firstParty,
      },
      scopes: p.scope,
      redirectHost: new URL(p.redirectUri).host,
      user: user && { login: user.login, displayName: user.displayName },
    };
  }

  async decide(id: string, user: AuthUser, approve: boolean): Promise<AuthorizeOutcome> {
    const p = await this.repo.request(id);
    if (!p) throw new NotFoundError('запрос авторизации не найден или истёк');
    if (!approve) {
      await this.repo.deleteRequest(id);
      return {
        redirect: this.redirectWith(p.redirectUri, {
          error: 'access_denied',
          error_description: 'пользователь отказал в доступе',
          state: p.state,
        }),
      };
    }
    const client = await this.activeClient(p.clientId);
    await this.repo.saveConsent(user.id, p.clientId, p.scope);
    await this.audit.record({
      actorId: user.id,
      action: 'oauth.consent_granted',
      target: p.clientId,
      details: { scopes: p.scope },
    });
    // Те же проверки, что и при обычном продолжении: сотрудник без MFA, max_age и т. п. кода не получат.
    return this.continue(id, p, client, user, false);
  }

  // ── /token ──

  private async authenticateClient(req: TokenRequest): Promise<ClientRecord> {
    const client = req.clientId ? await this.repo.client(req.clientId) : null;
    if (!client || client.disabled) throw new OAuthError('invalid_client', 'клиент не найден', 401);
    if (client.secretHash !== null) {
      if (!req.clientSecret || !safeEqualHex(sha256(req.clientSecret), client.secretHash)) {
        throw new OAuthError('invalid_client', 'неверный секрет клиента', 401);
      }
    } else if (req.clientSecret) {
      throw new OAuthError('invalid_client', 'публичному клиенту секрет не выдаётся', 401);
    }
    return client;
  }

  async token(req: TokenRequest): Promise<Record<string, unknown>> {
    const client = await this.authenticateClient(req);
    switch (req.grantType ?? '') {
      case 'authorization_code':
        return this.codeGrant(client, req);
      case 'refresh_token':
        return this.refreshGrant(client, req);
      case 'client_credentials':
        return this.clientCredentials(client, req);
      default:
        throw new OAuthError('unsupported_grant_type', 'неподдерживаемый grant_type');
    }
  }

  private async codeGrant(client: ClientRecord, req: TokenRequest) {
    if (!client.grantTypes.includes('authorization_code'))
      throw new OAuthError('unauthorized_client', 'grant_type не разрешён клиенту');
    if (!req.code) throw new OAuthError('invalid_request', 'нет параметра code');
    const found = await this.repo.consumeCode(sha256(req.code));
    if (!found) throw new OAuthError('invalid_grant', 'код недействителен или истёк');
    const { code, reused } = found;
    if (reused) {
      // Повторное предъявление кода: возможна утечка — отзываем всё, что выдано по нему этому клиенту.
      await this.repo.revokeForUserClient(code.userId, code.clientId);
      throw new OAuthError('invalid_grant', 'код уже использован');
    }
    if (code.clientId !== client.clientId) throw new OAuthError('invalid_grant', 'код выдан другому клиенту');
    if (req.redirectUri !== code.redirectUri)
      throw new OAuthError('invalid_grant', 'redirect_uri не совпадает');
    if (code.codeChallenge) {
      if (!req.codeVerifier || !pkceMatches(req.codeVerifier, code.codeChallenge))
        throw new OAuthError('invalid_grant', 'code_verifier не прошёл проверку PKCE');
    } else if (req.codeVerifier) {
      throw new OAuthError('invalid_grant', 'code_verifier без code_challenge');
    }
    const user = await this.users.findById(code.userId);
    if (!user || user.disabled) throw new OAuthError('invalid_grant', 'учётная запись удалена или отключена');
    await this.events.record({
      userId: user.id,
      success: true,
      method: 'oidc',
      amr: code.amr,
      clientId: client.clientId,
    });
    return this.userTokens(client, user.id, code.scope, code.authTime, code.amr, code.nonce, randomUUID());
  }

  private async refreshGrant(client: ClientRecord, req: TokenRequest) {
    if (!client.grantTypes.includes('refresh_token'))
      throw new OAuthError('unauthorized_client', 'grant_type не разрешён клиенту');
    if (!req.refreshToken) throw new OAuthError('invalid_request', 'нет параметра refresh_token');
    const hash = sha256(req.refreshToken);
    const rt = await this.repo.refresh(hash);
    if (rt?.clientId !== client.clientId)
      throw new OAuthError('invalid_grant', 'refresh-токен недействителен');
    if (rt.revokedAt || !(await this.repo.revokeRefresh(hash))) {
      // Повторное использование отозванного токена — признак кражи: отзываем всю цепочку.
      await this.repo.revokeFamily(rt.family);
      throw new OAuthError('invalid_grant', 'refresh-токен уже использован; сессия приложения отозвана');
    }
    if (rt.expiresAt <= new Date()) throw new OAuthError('invalid_grant', 'refresh-токен истёк');
    const requested = req.scope ? req.scope.split(' ').filter(Boolean) : rt.scope;
    if (requested.some((s) => !rt.scope.includes(s)))
      throw new OAuthError('invalid_scope', 'scope шире выданного');
    const user = await this.users.findById(rt.userId);
    if (!user || user.disabled) {
      await this.repo.revokeFamily(rt.family);
      throw new OAuthError('invalid_grant', 'учётная запись удалена или отключена');
    }
    return this.userTokens(client, user.id, requested, rt.authTime, rt.amr, null, rt.family);
  }

  private async clientCredentials(client: ClientRecord, req: TokenRequest) {
    if (!client.grantTypes.includes('client_credentials') || client.secretHash === null) {
      throw new OAuthError('unauthorized_client', 'client_credentials только для конфиденциальных клиентов');
    }
    const allowed = client.scopes.filter(
      (s) => !['openid', 'offline_access', 'profile', 'email'].includes(s),
    );
    const scope = req.scope ? req.scope.split(' ').filter(Boolean) : allowed;
    if (scope.some((s) => !allowed.includes(s)))
      throw new OAuthError('invalid_scope', 'scope не разрешён для client_credentials');
    const { kid, privateKey } = await this.keys.signingKey();
    const now = Math.floor(Date.now() / 1000);
    const ttl = this.config.OIDC_ACCESS_TOKEN_TTL_S;
    const access = signJwt(
      {
        iss: this.issuer,
        sub: client.clientId,
        aud: client.clientId,
        client_id: client.clientId,
        scope: scope.join(' '),
        iat: now,
        exp: now + ttl,
        jti: randomUUID(),
      },
      privateKey,
      kid,
      'at+jwt',
    );
    return { access_token: access, token_type: 'Bearer', expires_in: ttl, scope: scope.join(' ') };
  }

  private async userTokens(
    client: ClientRecord,
    userId: string,
    scope: string[],
    authTime: Date,
    amr: string[],
    nonce: string | null,
    family: string,
  ) {
    const { kid, privateKey } = await this.keys.signingKey();
    const now = Math.floor(Date.now() / 1000);
    const ttl = this.config.OIDC_ACCESS_TOKEN_TTL_S;
    const at = Math.floor(authTime.getTime() / 1000);
    const access = signJwt(
      {
        iss: this.issuer,
        sub: userId,
        aud: client.clientId,
        client_id: client.clientId,
        scope: scope.join(' '),
        iat: now,
        exp: now + ttl,
        auth_time: at,
        amr,
        jti: randomUUID(),
      },
      privateKey,
      kid,
      'at+jwt',
    );
    const out: Record<string, unknown> = {
      access_token: access,
      token_type: 'Bearer',
      expires_in: ttl,
      scope: scope.join(' '),
    };
    if (scope.includes('openid')) {
      out.id_token = signJwt(
        {
          iss: this.issuer,
          sub: userId,
          aud: client.clientId,
          azp: client.clientId,
          iat: now,
          exp: now + ttl,
          auth_time: at,
          amr,
          acr: acrOf(amr),
          ...(nonce && { nonce }),
          ...(await this.claims(userId, scope)),
        },
        privateKey,
        kid,
      );
    }
    if (scope.includes('offline_access') && client.grantTypes.includes('refresh_token')) {
      const refresh = randomBytes(32).toString('base64url');
      await this.repo.saveRefresh({
        tokenHash: sha256(refresh),
        family,
        clientId: client.clientId,
        userId,
        scope,
        authTime,
        amr,
        expiresAt: new Date(Date.now() + this.config.OIDC_REFRESH_TOKEN_TTL_DAYS * 86_400_000),
      });
      out.refresh_token = refresh;
    }
    return out;
  }

  /** Claims пользователя по scope (OIDC Core §5.4). */
  private async claims(userId: string, scope: string[]): Promise<Record<string, unknown>> {
    const user = await this.users.findById(userId);
    if (!user) return {};
    const out: Record<string, unknown> = {};
    const needMe = scope.some((s) => ['profile', 'email', 'biometrics'].includes(s));
    const me = needMe
      ? await this.me.me({
          id: user.id,
          login: user.login,
          displayName: user.displayName,
          role: user.role,
          sessionId: '',
          mfaComplete: true,
          amr: [],
          authTime: new Date(),
        })
      : null;
    if (scope.includes('profile') && me) {
      out.name = user.displayName;
      out.preferred_username = user.login;
      if (me.avatarUrl) out.picture = `${this.issuer}${me.avatarUrl}`;
    }
    if (scope.includes('email') && me?.email) {
      out.email = me.email;
      out.email_verified = false;
    }
    if (scope.includes('roles')) out.role = user.role;
    if (scope.includes('biometrics') && me) {
      out.face_enrolled = me.face !== null;
      out.passkeys = me.passkeys;
    }
    return out;
  }

  // ── userinfo, интроспекция, отзыв ──

  private verifyAccess(token: string) {
    const d = verifyJwt(token, (kid) => this.keys.publicKey(kid));
    if (d?.header.typ !== 'at+jwt' || d.payload.iss !== this.issuer) return null;
    return d.payload;
  }

  async userinfo(bearer: string | null): Promise<Record<string, unknown>> {
    await this.keys.signingKey();
    const p = bearer ? this.verifyAccess(bearer) : null;
    if (!p) throw new OAuthError('invalid_token', 'токен доступа недействителен или истёк', 401);
    const scope = typeof p.scope === 'string' ? p.scope.split(' ') : [];
    if (!scope.includes('openid') || p.sub === p.client_id)
      throw new OAuthError('insufficient_scope', 'нужен scope openid', 403);
    const user = await this.users.findById(String(p.sub));
    if (!user || user.disabled)
      throw new OAuthError('invalid_token', 'учётная запись удалена или отключена', 401);
    return { sub: p.sub, ...(await this.claims(String(p.sub), scope)) };
  }

  async introspect(req: TokenRequest & { token?: string }): Promise<Record<string, unknown>> {
    const client = await this.authenticateClient(req);
    if (client.secretHash === null)
      throw new OAuthError('invalid_client', 'интроспекция только для конфиденциальных клиентов', 401);
    await this.keys.signingKey();
    if (!req.token) return { active: false };
    const p = this.verifyAccess(req.token);
    if (p)
      return {
        active: true,
        token_type: 'Bearer',
        scope: p.scope,
        client_id: p.client_id,
        sub: p.sub,
        aud: p.aud,
        iss: p.iss,
        exp: p.exp,
        iat: p.iat,
        amr: p.amr,
      };
    const rt = await this.repo.refresh(sha256(req.token));
    if (rt && !rt.revokedAt && rt.expiresAt > new Date()) {
      return {
        active: true,
        token_type: 'refresh_token',
        scope: rt.scope.join(' '),
        client_id: rt.clientId,
        sub: rt.userId,
        exp: Math.floor(rt.expiresAt.getTime() / 1000),
      };
    }
    return { active: false };
  }

  /** RFC 7009: ответ 200 и для неизвестного токена; access-токены (JWT) живут до истечения срока. */
  async revoke(req: TokenRequest & { token?: string }): Promise<void> {
    const client = await this.authenticateClient(req);
    if (!req.token) throw new OAuthError('invalid_request', 'нет параметра token');
    const rt = await this.repo.refresh(sha256(req.token));
    if (rt?.clientId === client.clientId) await this.repo.revokeFamily(rt.family);
  }

  /**
   * RP-Initiated Logout. Без действительного id_token_hint, выданного текущему пользователю, сессия молча
   * не завершается (иначе любой сайт мог бы разлогинить пользователя картинкой): пользователь подтверждает
   * выход на странице интерфейса. Возвращает адрес перехода и признак, можно ли завершить сессию сразу.
   */
  async logoutRedirect(
    q: Record<string, string | undefined>,
    user: AuthUser | null,
  ): Promise<{ redirect: string; endSession: boolean }> {
    await this.keys.signingKey();
    // Срок id_token_hint не проверяется (OIDC RP-Initiated Logout §2): важны подпись, издатель и получатель.
    const hint = q.id_token_hint ? verifyJwt(q.id_token_hint, (kid) => this.keys.publicKey(kid), 0) : null;
    const hintAud = typeof hint?.payload.aud === 'string' ? hint.payload.aud : undefined;
    const clientId = q.client_id ?? hintAud;
    const target = await this.postLogoutTarget(clientId, q.post_logout_redirect_uri, q.state);
    const trusted =
      !!hint &&
      hint.payload.iss === this.issuer &&
      hintAud === clientId &&
      (!user || hint.payload.sub === user.id);
    if (!user || trusted) return { redirect: target, endSession: true };
    const confirm = new URL('/oauth/logout', this.webOrigin);
    for (const k of ['client_id', 'post_logout_redirect_uri', 'state'] as const) {
      const v = k === 'client_id' ? clientId : q[k];
      if (v) confirm.searchParams.set(k, v);
    }
    return { redirect: confirm.toString(), endSession: false };
  }

  /** Зарегистрированный post_logout_redirect_uri клиента (со state) или страница входа. */
  async postLogoutTarget(
    clientId: string | undefined,
    target: string | undefined,
    state: string | undefined,
  ) {
    const client = clientId ? await this.repo.client(clientId) : null;
    if (target && client?.postLogoutRedirectUris.includes(target)) {
      const u = new URL(target);
      if (state) u.searchParams.set('state', state);
      return u.toString();
    }
    return `${this.webOrigin}/login`;
  }

  /** Сведения для страницы подтверждения выхода. */
  async logoutClientName(clientId: string | undefined): Promise<string | null> {
    const client = clientId ? await this.repo.client(clientId) : null;
    return client?.name ?? null;
  }

  // ── подключённые приложения пользователя ──

  async connectedApps(user: AuthUser): Promise<ConnectedAppDto[]> {
    return (await this.repo.connectedApps(user.id)).map((a) => ({
      clientId: a.clientId,
      name: a.name,
      scopes: a.scopes,
      grantedAt: a.grantedAt.toISOString(),
      lastUsedAt: a.lastUsedAt?.toISOString() ?? null,
    }));
  }

  async disconnect(user: AuthUser, clientId: string): Promise<void> {
    const removed = await this.repo.deleteConsent(user.id, clientId);
    await this.repo.revokeForUserClient(user.id, clientId);
    if (!removed) throw new NotFoundError('приложение не подключено');
    await this.audit.record({ actorId: user.id, action: 'oauth.consent_revoked', target: clientId });
  }
}
