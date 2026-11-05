export const OIDC_REPOSITORY = Symbol('OIDC_REPOSITORY');

export type GrantType = 'authorization_code' | 'refresh_token' | 'client_credentials';

export interface ClientRecord {
  readonly clientId: string;
  readonly secretHash: string | null;
  readonly name: string;
  readonly description: string | null;
  readonly redirectUris: string[];
  readonly postLogoutRedirectUris: string[];
  readonly grantTypes: GrantType[];
  readonly scopes: string[];
  readonly firstParty: boolean;
  readonly disabled: boolean;
  readonly createdAt: Date;
}

export interface AuthorizeParams {
  readonly clientId: string;
  readonly redirectUri: string;
  readonly scope: string[];
  readonly state: string | null;
  readonly nonce: string | null;
  readonly codeChallenge: string | null;
  readonly prompt: string | null;
  readonly maxAge: number | null;
}

export interface CodeRecord {
  readonly clientId: string;
  readonly userId: string;
  readonly redirectUri: string;
  readonly scope: string[];
  readonly codeChallenge: string | null;
  readonly nonce: string | null;
  readonly authTime: Date;
  readonly amr: string[];
}

export interface RefreshRecord {
  readonly tokenHash: string;
  readonly family: string;
  readonly clientId: string;
  readonly userId: string;
  readonly scope: string[];
  readonly authTime: Date;
  readonly amr: string[];
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

export interface SigningKeyRecord {
  readonly kid: string;
  readonly publicJwk: Record<string, unknown>;
  readonly privateEnc: Buffer;
  readonly iv: Buffer;
  readonly kekId: string;
  readonly active: boolean;
}

export interface OidcRepository {
  client(clientId: string): Promise<ClientRecord | null>;
  clients(): Promise<(ClientRecord & { activeGrants: number })[]>;
  createClient(
    c: Omit<ClientRecord, 'createdAt' | 'disabled'> & { createdBy: string | null },
  ): Promise<boolean>;
  updateClient(
    clientId: string,
    patch: Partial<Omit<ClientRecord, 'clientId' | 'createdAt'>>,
  ): Promise<boolean>;
  deleteClient(clientId: string): Promise<boolean>;

  saveRequest(params: AuthorizeParams, expiresAt: Date): Promise<string>;
  request(id: string): Promise<AuthorizeParams | null>;
  deleteRequest(id: string): Promise<void>;

  saveCode(codeHash: string, c: CodeRecord, expiresAt: Date): Promise<void>;
  /** Атомарно помечает код использованным; null — нет, просрочен или уже использован (used=true). */
  consumeCode(codeHash: string): Promise<{ code: CodeRecord; reused: boolean } | null>;

  saveRefresh(r: Omit<RefreshRecord, 'revokedAt'>): Promise<void>;
  refresh(tokenHash: string): Promise<RefreshRecord | null>;
  /** Атомарно отзывает токен; false — уже отозван (повторное использование). */
  revokeRefresh(tokenHash: string): Promise<boolean>;
  revokeFamily(family: string): Promise<void>;
  revokeForUserClient(userId: string, clientId: string): Promise<void>;
  touchRefresh?(tokenHash: string): Promise<void>;

  consent(userId: string, clientId: string): Promise<string[] | null>;
  saveConsent(userId: string, clientId: string, scopes: string[]): Promise<void>;
  deleteConsent(userId: string, clientId: string): Promise<boolean>;
  connectedApps(
    userId: string,
  ): Promise<
    { clientId: string; name: string; scopes: string[]; grantedAt: Date; lastUsedAt: Date | null }[]
  >;

  signingKeys(): Promise<SigningKeyRecord[]>;
  saveSigningKey(k: Omit<SigningKeyRecord, 'active'>): Promise<void>;
}
