import { randomBytes } from 'node:crypto';

import type { CreateOauthClient, OauthClientDto, UpdateOauthClient } from '@bioauth/contracts';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { sha256 } from '../../../shared/crypto/jwt';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { type ClientRecord, type GrantType, OIDC_REPOSITORY, type OidcRepository } from './ports';

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
    await this.repo.updateClient(clientId, {
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
}
