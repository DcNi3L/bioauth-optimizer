import { Inject, Injectable } from '@nestjs/common';
import { type Selectable, sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { OauthClientTable } from '../../../shared/database/schema';
import type {
  AuthorizeParams,
  ClientRecord,
  CodeRecord,
  OidcRepository,
  RefreshRecord,
  SigningKeyRecord,
} from '../application/ports';

type ClientRow = Selectable<OauthClientTable>;

const toClient = (r: ClientRow): ClientRecord => ({
  clientId: r.client_id,
  secretHash: r.secret_hash,
  name: r.name,
  description: r.description,
  redirectUris: r.redirect_uris,
  postLogoutRedirectUris: r.post_logout_redirect_uris,
  grantTypes: r.grant_types,
  scopes: r.scopes,
  firstParty: r.first_party,
  disabled: r.disabled,
  createdAt: r.created_at,
});

@Injectable()
export class KyselyOidcRepository implements OidcRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async client(clientId: string): Promise<ClientRecord | null> {
    const r = await this.db
      .selectFrom('oauth_client')
      .selectAll()
      .where('client_id', '=', clientId)
      .executeTakeFirst();
    return r ? toClient(r) : null;
  }

  async clients() {
    const rows = await this.db
      .selectFrom('oauth_client as c')
      .selectAll('c')
      .select((eb) =>
        eb
          .selectFrom('oauth_consent as k')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('k.client_id', '=', 'c.client_id')
          .as('grants'),
      )
      .orderBy('c.created_at', 'desc')
      .execute();
    return rows.map((r) => ({ ...toClient(r), activeGrants: Number(r.grants ?? 0) }));
  }

  async createClient(
    c: Omit<ClientRecord, 'createdAt' | 'disabled'> & { createdBy: string | null },
  ): Promise<boolean> {
    const r = await this.db
      .insertInto('oauth_client')
      .values({
        client_id: c.clientId,
        secret_hash: c.secretHash,
        name: c.name,
        description: c.description,
        redirect_uris: c.redirectUris,
        post_logout_redirect_uris: c.postLogoutRedirectUris,
        grant_types: c.grantTypes,
        scopes: c.scopes,
        first_party: c.firstParty,
        created_by: c.createdBy,
      })
      .onConflict((oc) => oc.column('client_id').doNothing())
      .executeTakeFirst();
    return (r.numInsertedOrUpdatedRows ?? 0n) > 0n;
  }

  async updateClient(
    clientId: string,
    p: Partial<Omit<ClientRecord, 'clientId' | 'createdAt'>>,
  ): Promise<boolean> {
    const r = await this.db
      .updateTable('oauth_client')
      .set({
        ...(p.name !== undefined && { name: p.name }),
        ...(p.description !== undefined && { description: p.description }),
        ...(p.redirectUris && { redirect_uris: p.redirectUris }),
        ...(p.postLogoutRedirectUris && { post_logout_redirect_uris: p.postLogoutRedirectUris }),
        ...(p.grantTypes && { grant_types: p.grantTypes }),
        ...(p.scopes && { scopes: p.scopes }),
        ...(p.firstParty !== undefined && { first_party: p.firstParty }),
        ...(p.disabled !== undefined && { disabled: p.disabled }),
        ...(p.secretHash !== undefined && { secret_hash: p.secretHash }),
      })
      .where('client_id', '=', clientId)
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }

  async deleteClient(clientId: string): Promise<boolean> {
    const r = await this.db.deleteFrom('oauth_client').where('client_id', '=', clientId).executeTakeFirst();
    return r.numDeletedRows > 0n;
  }

  async saveRequest(params: AuthorizeParams, expiresAt: Date): Promise<string> {
    // Попутно убираем просроченные запросы и коды — их немного, отдельный планировщик не нужен.
    await this.db.deleteFrom('oauth_request').where('expires_at', '<', new Date()).execute();
    await this.db
      .deleteFrom('oauth_code')
      .where('expires_at', '<', new Date(Date.now() - 3600_000))
      .execute();
    const r = await this.db
      .insertInto('oauth_request')
      .values({ client_id: params.clientId, params: JSON.stringify(params), expires_at: expiresAt })
      .returning('id')
      .executeTakeFirstOrThrow();
    return r.id;
  }

  async request(id: string): Promise<AuthorizeParams | null> {
    const r = await this.db
      .selectFrom('oauth_request')
      .select('params')
      .where('id', '=', id)
      .where('expires_at', '>', new Date())
      .executeTakeFirst();
    return r ? (r.params as AuthorizeParams) : null;
  }

  async deleteRequest(id: string): Promise<void> {
    await this.db.deleteFrom('oauth_request').where('id', '=', id).execute();
  }

  async saveCode(codeHash: string, c: CodeRecord, expiresAt: Date): Promise<void> {
    await this.db
      .insertInto('oauth_code')
      .values({
        code_hash: codeHash,
        client_id: c.clientId,
        user_id: c.userId,
        redirect_uri: c.redirectUri,
        scope: c.scope,
        code_challenge: c.codeChallenge,
        nonce: c.nonce,
        auth_time: c.authTime,
        amr: c.amr,
        expires_at: expiresAt,
      })
      .execute();
  }

  async consumeCode(codeHash: string) {
    const used = await this.db
      .updateTable('oauth_code')
      .set({ used_at: new Date() })
      .where('code_hash', '=', codeHash)
      .where('used_at', 'is', null)
      .where('expires_at', '>', new Date())
      .returningAll()
      .executeTakeFirst();
    const row =
      used ??
      (await this.db
        .selectFrom('oauth_code')
        .selectAll()
        .where('code_hash', '=', codeHash)
        .executeTakeFirst());
    if (!row) return null;
    if (!used && row.used_at === null) return null; // просрочен
    return {
      reused: !used,
      code: {
        clientId: row.client_id,
        userId: row.user_id,
        redirectUri: row.redirect_uri,
        scope: row.scope,
        codeChallenge: row.code_challenge,
        nonce: row.nonce,
        authTime: row.auth_time,
        amr: row.amr,
      },
    };
  }

  async saveRefresh(r: Omit<RefreshRecord, 'revokedAt'>): Promise<void> {
    await this.db
      .insertInto('oauth_refresh_token')
      .values({
        token_hash: r.tokenHash,
        family: r.family,
        client_id: r.clientId,
        user_id: r.userId,
        scope: r.scope,
        auth_time: r.authTime,
        amr: r.amr,
        expires_at: r.expiresAt,
      })
      .execute();
  }

  async refresh(tokenHash: string): Promise<RefreshRecord | null> {
    const r = await this.db
      .selectFrom('oauth_refresh_token')
      .selectAll()
      .where('token_hash', '=', tokenHash)
      .executeTakeFirst();
    return r
      ? {
          tokenHash: r.token_hash,
          family: r.family,
          clientId: r.client_id,
          userId: r.user_id,
          scope: r.scope,
          authTime: r.auth_time,
          amr: r.amr,
          expiresAt: r.expires_at,
          revokedAt: r.revoked_at,
        }
      : null;
  }

  async revokeRefresh(tokenHash: string): Promise<boolean> {
    const r = await this.db
      .updateTable('oauth_refresh_token')
      .set({ revoked_at: new Date() })
      .where('token_hash', '=', tokenHash)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }

  async revokeFamily(family: string): Promise<void> {
    await this.db
      .updateTable('oauth_refresh_token')
      .set({ revoked_at: new Date() })
      .where('family', '=', family)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async revokeForUserClient(userId: string, clientId: string): Promise<void> {
    await this.db
      .updateTable('oauth_refresh_token')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('client_id', '=', clientId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async consent(userId: string, clientId: string): Promise<string[] | null> {
    const r = await this.db
      .selectFrom('oauth_consent')
      .select('scopes')
      .where('user_id', '=', userId)
      .where('client_id', '=', clientId)
      .executeTakeFirst();
    return r?.scopes ?? null;
  }

  async saveConsent(userId: string, clientId: string, scopes: string[]): Promise<void> {
    await this.db
      .insertInto('oauth_consent')
      .values({ user_id: userId, client_id: clientId, scopes })
      .onConflict((oc) =>
        oc.columns(['user_id', 'client_id']).doUpdateSet({
          scopes: sql<
            string[]
          >`(SELECT array_agg(DISTINCT s) FROM unnest(oauth_consent.scopes || excluded.scopes) AS s)`,
          granted_at: new Date(),
        }),
      )
      .execute();
  }

  async deleteConsent(userId: string, clientId: string): Promise<boolean> {
    const r = await this.db
      .deleteFrom('oauth_consent')
      .where('user_id', '=', userId)
      .where('client_id', '=', clientId)
      .executeTakeFirst();
    return r.numDeletedRows > 0n;
  }

  async connectedApps(userId: string) {
    const rows = await this.db
      .selectFrom('oauth_consent as c')
      .innerJoin('oauth_client as k', 'k.client_id', 'c.client_id')
      .select((eb) => [
        'c.client_id',
        'k.name',
        'c.scopes',
        'c.granted_at',
        eb
          .selectFrom('oauth_refresh_token as t')
          .select((e) => e.fn.max('t.created_at').as('m'))
          .whereRef('t.client_id', '=', 'c.client_id')
          .whereRef('t.user_id', '=', 'c.user_id')
          .as('last_used'),
      ])
      .where('c.user_id', '=', userId)
      .orderBy('c.granted_at', 'desc')
      .execute();
    return rows.map((r) => ({
      clientId: r.client_id,
      name: r.name,
      scopes: r.scopes,
      grantedAt: r.granted_at,
      lastUsedAt: r.last_used ?? null,
    }));
  }

  async signingKeys(): Promise<SigningKeyRecord[]> {
    const rows = await this.db
      .selectFrom('oauth_signing_key')
      .selectAll()
      .orderBy('created_at', 'desc')
      .execute();
    return rows.map((r) => ({
      kid: r.kid,
      publicJwk: r.public_jwk as unknown as Record<string, unknown>,
      privateEnc: r.private_enc,
      iv: r.iv,
      kekId: r.kek_id,
      active: r.active,
    }));
  }

  async saveSigningKey(k: Omit<SigningKeyRecord, 'active'>): Promise<void> {
    await this.db.transaction().execute(async (trx) => {
      await trx.updateTable('oauth_signing_key').set({ active: false }).where('active', '=', true).execute();
      await trx
        .insertInto('oauth_signing_key')
        .values({
          kid: k.kid,
          public_jwk: JSON.stringify(k.publicJwk),
          private_enc: k.privateEnc,
          iv: k.iv,
          kek_id: k.kekId,
          active: true,
        })
        .execute();
    });
  }
}
