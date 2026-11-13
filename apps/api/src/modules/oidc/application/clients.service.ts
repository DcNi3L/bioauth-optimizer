import { randomBytes } from 'node:crypto';

import type {
  CreateOauthClient,
  InitialTokenCreatedDto,
  InitialTokenDto,
  OauthClientDto,
  UpdateOauthClient,
} from '@bioauth/contracts';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { sha256 } from '../../../shared/crypto/jwt';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { OAuthError } from './oidc.service';
import { type ClientRecord, type GrantType, OIDC_REPOSITORY, type OidcRepository } from './ports';

/** Что может запросить приложение, зарегистрированное само: без ролей и биометрии, без client_credentials. */
const DYNAMIC_SCOPES = ['openid', 'profile', 'email', 'offline_access'];
const DYNAMIC_GRANTS: GrantType[] = ['authorization_code', 'refresh_token'];
const AUTH_METHODS = ['none', 'client_secret_basic', 'client_secret_post'];
const LOOPBACK = new Set(['localhost', '127.0.0.1', '[::1]']);

const strings = (v: unknown, field: string): string[] | undefined => {
  if (v === undefined) return undefined;
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string'))
    throw new OAuthError('invalid_client_metadata', `${field}: нужен массив строк`);
  return v as string[];
};

export const DEMO_CLIENT_ID = 'bioauth-demo';

const toDto = (c: ClientRecord & { activeGrants?: number }): OauthClientDto => ({
  clientId: c.clientId,
  name: c.name,
  description: c.description,
  type: c.secretHash === null ? 'public' : 'confidential',
  redirectUris: c.redirectUris,
  postLogoutRedirectUris: c.postLogoutRedirectUris,
  grantTypes: c.grantTypes,
  scopes: c.scopes,
  firstParty: c.firstParty,
  disabled: c.disabled,
  pendingReview: c.pendingReview,
  createdAt: c.createdAt.toISOString(),
  activeGrants: c.activeGrants ?? 0,
});

const newSecret = () => randomBytes(32).toString('base64url');

/** Регистрация приложений-клиентов (администратор). Секрет показывается один раз, в БД — только sha256. */
@Injectable()
export class ClientsService implements OnApplicationBootstrap {
  private readonly logger = new Logger('OidcClients');

  constructor(
    @Inject(OIDC_REPOSITORY) private readonly repo: OidcRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Демо-клиент для страницы /oauth/demo: публичный, PKCE, со страницей согласия. */
  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.OIDC_DEMO_CLIENT) return;
    const origin = this.config.RP_ORIGIN.replace(/\/$/, '');
    const created = await this.repo.createClient({
      clientId: DEMO_CLIENT_ID,
      secretHash: null,
      name: 'Демо-приложение BioAuth',
      description:
        'Пример стороннего приложения: вход через BioAuth по OpenID Connect (Authorization Code + PKCE).',
      redirectUris: [`${origin}/oauth/demo`],
      postLogoutRedirectUris: [`${origin}/oauth/demo`],
      grantTypes: ['authorization_code', 'refresh_token'],
      scopes: ['openid', 'profile', 'email', 'roles', 'offline_access', 'biometrics'],
      firstParty: false,
      createdBy: null,
    });
    if (created) this.logger.log(`создан демо-клиент ${DEMO_CLIENT_ID}`);
  }

  async list(): Promise<OauthClientDto[]> {
    return (await this.repo.clients()).map(toDto);
  }

  private validate(
    type: 'public' | 'confidential',
    grants: readonly GrantType[],
    redirects: readonly string[],
  ): void {
    if (grants.includes('client_credentials') && type === 'public') {
      throw new ValidationError('client_credentials доступен только конфиденциальному клиенту', 'grantTypes');
    }
    if (grants.includes('authorization_code') && redirects.length === 0) {
      throw new ValidationError('для кода авторизации нужен хотя бы один адрес возврата', 'redirectUris');
    }
  }

  async create(
    actor: AuthUser,
    c: Required<Omit<CreateOauthClient, 'description'>> & { description: string | null },
  ): Promise<{ client: OauthClientDto; clientSecret: string | null }> {
    this.validate(c.type, c.grantTypes, c.redirectUris);
    const secret = c.type === 'confidential' ? newSecret() : null;
    const ok = await this.repo.createClient({
      clientId: c.clientId,
      secretHash: secret ? sha256(secret) : null,
      name: c.name,
      description: c.description,
      redirectUris: c.redirectUris,
      postLogoutRedirectUris: c.postLogoutRedirectUris,
      grantTypes: c.grantTypes,
      scopes: c.scopes,
      firstParty: c.firstParty,
      createdBy: actor.id,
    });
    if (!ok) throw new ConflictError(`клиент «${c.clientId}» уже существует`);
    await this.audit.record({
      actorId: actor.id,
      action: 'oauth.client_created',
      target: c.clientId,
      details: { type: c.type, scopes: c.scopes },
    });
    return { client: toDto((await this.repo.client(c.clientId))!), clientSecret: secret };
  }

  async update(
    actor: AuthUser,
    clientId: string,
    p: UpdateOauthClient,
  ): Promise<{ client: OauthClientDto; clientSecret: string | null }> {
    const cur = await this.repo.client(clientId);
    if (!cur) throw new NotFoundError('клиент не найден');
    const type = cur.secretHash === null ? 'public' : 'confidential';
    this.validate(type, p.grantTypes ?? cur.grantTypes, p.redirectUris ?? cur.redirectUris);
    if (p.rotateSecret && type === 'public')
      throw new ValidationError('у публичного клиента нет секрета', 'rotateSecret');
    const secret = p.rotateSecret ? newSecret() : null;
    // Включение клиента, зарегистрированного самостоятельно, — это и есть его проверка администратором.
    const approved = cur.pendingReview && p.disabled === false;
    await this.repo.updateClient(clientId, {
      ...(approved && { pendingReview: false }),
      ...(p.name !== undefined && { name: p.name }),
      ...(p.description !== undefined && { description: p.description }),
      ...(p.redirectUris && { redirectUris: p.redirectUris }),
      ...(p.postLogoutRedirectUris && { postLogoutRedirectUris: p.postLogoutRedirectUris }),
      ...(p.grantTypes && { grantTypes: p.grantTypes }),
      ...(p.scopes && { scopes: p.scopes }),
      ...(p.firstParty !== undefined && { firstParty: p.firstParty }),
      ...(p.disabled !== undefined && { disabled: p.disabled }),
      ...(secret && { secretHash: sha256(secret) }),
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'oauth.client_updated',
      target: clientId,
      details: { ...p, rotateSecret: !!p.rotateSecret },
    });
    return { client: toDto((await this.repo.client(clientId))!), clientSecret: secret };
  }

  async remove(actor: AuthUser, clientId: string): Promise<void> {
    if (!(await this.repo.deleteClient(clientId))) throw new NotFoundError('клиент не найден');
    await this.audit.record({ actorId: actor.id, action: 'oauth.client_deleted', target: clientId });
  }

  // ── RFC 7591: динамическая регистрация (#47) ──

  async createInitialToken(
    actor: AuthUser,
    c: { note: string | null; uses: number; ttlHours: number },
  ): Promise<InitialTokenCreatedDto> {
    const token = `iat_${randomBytes(24).toString('base64url')}`;
    const expiresAt = new Date(Date.now() + c.ttlHours * 3600_000);
    const id = await this.repo.createInitialToken({
      tokenHash: sha256(token),
      note: c.note,
      uses: c.uses,
      expiresAt,
      createdBy: actor.id,
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'oauth.initial_token_created',
      target: id,
      details: { uses: c.uses, ttlHours: c.ttlHours, note: c.note },
    });
    return {
      id,
      note: c.note,
      usesLeft: c.uses,
      expiresAt: expiresAt.toISOString(),
      createdAt: new Date().toISOString(),
      token,
    };
  }

  async initialTokens(): Promise<InitialTokenDto[]> {
    return (await this.repo.initialTokens()).map((t) => ({
      ...t,
      expiresAt: t.expiresAt.toISOString(),
      createdAt: t.createdAt.toISOString(),
    }));
  }

  async deleteInitialToken(actor: AuthUser, id: string): Promise<void> {
    if (!(await this.repo.deleteInitialToken(id))) throw new NotFoundError('токен не найден');
    await this.audit.record({ actorId: actor.id, action: 'oauth.initial_token_deleted', target: id });
  }

  private checkRedirect(uri: string, field: string): void {
    let u: URL;
    try {
      u = new URL(uri);
    } catch {
      throw new OAuthError('invalid_redirect_uri', `${field}: «${uri}» — не адрес`);
    }
    const loopback = u.protocol === 'http:' && LOOPBACK.has(u.hostname);
    if (u.protocol !== 'https:' && !loopback)
      throw new OAuthError('invalid_redirect_uri', `${field}: только https (http — лишь для localhost)`);
    if (u.hash || uri.includes('*') || u.username || u.password)
      throw new OAuthError('invalid_redirect_uri', `${field}: без фрагмента, учётных данных и масок`);
    const allowed = this.config.OIDC_REGISTRATION_ALLOWED_HOSTS;
    if (!loopback && allowed.length > 0 && !allowed.includes(u.hostname.toLowerCase()))
      throw new OAuthError(
        'invalid_redirect_uri',
        `${field}: хост ${u.hostname} не разрешён для регистрации`,
      );
  }

  /**
   * POST /oidc/register (RFC 7591). Нужен начальный токен администратора (Bearer). Клиент создаётся выключенным и
   * ждёт проверки: администратор включает его в «Приложения OAuth». Роли, биометрия и client_credentials недоступны.
   */
  async register(
    bearer: string | undefined,
    meta: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    if (!this.config.OIDC_DYNAMIC_REGISTRATION)
      throw new OAuthError('access_denied', 'динамическая регистрация выключена', 404);
    const redirectUris = strings(meta.redirect_uris, 'redirect_uris') ?? [];
    if (redirectUris.length === 0 || redirectUris.length > 10)
      throw new OAuthError('invalid_redirect_uri', 'redirect_uris: от 1 до 10 адресов');
    redirectUris.forEach((u) => this.checkRedirect(u, 'redirect_uris'));
    const postLogout = strings(meta.post_logout_redirect_uris, 'post_logout_redirect_uris') ?? [];
    if (postLogout.length > 10)
      throw new OAuthError('invalid_client_metadata', 'post_logout_redirect_uris: не более 10');
    postLogout.forEach((u) => this.checkRedirect(u, 'post_logout_redirect_uris'));
    const method = meta.token_endpoint_auth_method ?? 'client_secret_basic';
    if (typeof method !== 'string' || !AUTH_METHODS.includes(method))
      throw new OAuthError(
        'invalid_client_metadata',
        `token_endpoint_auth_method: ${AUTH_METHODS.join(', ')}`,
      );
    const grants = (strings(meta.grant_types, 'grant_types') ?? ['authorization_code']) as GrantType[];
    if (!grants.includes('authorization_code') || grants.some((g) => !DYNAMIC_GRANTS.includes(g)))
      throw new OAuthError(
        'invalid_client_metadata',
        'grant_types: authorization_code и, по желанию, refresh_token',
      );
    const responseTypes = strings(meta.response_types, 'response_types') ?? ['code'];
    if (responseTypes.length !== 1 || responseTypes[0] !== 'code')
      throw new OAuthError('invalid_client_metadata', 'response_types: только code');
    const scopeRaw = meta.scope ?? 'openid profile';
    if (typeof scopeRaw !== 'string')
      throw new OAuthError('invalid_client_metadata', 'scope: строка через пробел');
    const scopes = [...new Set(scopeRaw.split(' ').filter(Boolean))];
    if (!scopes.includes('openid') || scopes.some((s) => !DYNAMIC_SCOPES.includes(s)))
      throw new OAuthError(
        'invalid_client_metadata',
        `scope: openid и любые из ${DYNAMIC_SCOPES.join(', ')}`,
      );
    const nameRaw = meta.client_name;
    if (
      nameRaw !== undefined &&
      (typeof nameRaw !== 'string' || nameRaw.trim() === '' || nameRaw.length > 120)
    )
      throw new OAuthError('invalid_client_metadata', 'client_name: 1–120 символов');

    if (!bearer || !(await this.repo.useInitialToken(sha256(bearer))))
      throw new OAuthError('invalid_token', 'нужен действующий начальный токен доступа', 401);

    const clientId = `dyn-${randomBytes(9).toString('base64url')}`;
    const secret = method === 'none' ? null : newSecret();
    const name = typeof nameRaw === 'string' ? nameRaw.trim() : `Приложение ${clientId}`;
    await this.repo.createClient({
      clientId,
      secretHash: secret ? sha256(secret) : null,
      name,
      description: null,
      redirectUris,
      postLogoutRedirectUris: postLogout,
      grantTypes: grants,
      scopes,
      firstParty: false,
      createdBy: null,
      disabled: true,
      pendingReview: true,
    });
    await this.audit.record({
      actorId: null,
      action: 'oauth.client_registered',
      target: clientId,
      details: { name, redirectUris, scopes, method },
    });
    return {
      client_id: clientId,
      ...(secret && { client_secret: secret, client_secret_expires_at: 0 }),
      client_id_issued_at: Math.floor(Date.now() / 1000),
      client_name: name,
      redirect_uris: redirectUris,
      post_logout_redirect_uris: postLogout,
      grant_types: grants,
      response_types: ['code'],
      token_endpoint_auth_method: method,
      scope: scopes.join(' '),
      // Не из RFC 7591: клиент выключен, пока его не проверит администратор.
      bioauth_status: 'pending_review',
    };
  }
}
