export const WEBAUTHN = Symbol('WEBAUTHN');
export const CREDENTIALS = Symbol('CREDENTIALS');
export const CHALLENGES = Symbol('CHALLENGES');

export interface StoredCredential {
  readonly credentialId: string;
  readonly userId: string;
  readonly publicKey: Buffer;
  readonly counter: number;
  readonly transports: string[];
  readonly deviceType: string;
  readonly backedUp: boolean;
}

export interface RegistrationResult {
  readonly credentialId: string;
  readonly publicKey: Buffer;
  readonly counter: number;
  readonly transports: string[];
  readonly deviceType: string;
  readonly backedUp: boolean;
}

/** Порт WebAuthn (адаптер — @simplewebauthn/server). Опции — JSON для navigator.credentials в браузере. */
export interface WebAuthnPort {
  registrationOptions(
    user: { id: string; login: string; displayName: string },
    exclude: StoredCredential[],
  ): Promise<{
    options: Record<string, unknown>;
    challenge: string;
  }>;
  verifyRegistration(response: unknown, challenge: string): Promise<RegistrationResult | null>;
  authenticationOptions(
    allow: StoredCredential[],
  ): Promise<{ options: Record<string, unknown>; challenge: string }>;
  /** null — подпись неверна, нет проверки пользователя (UV) или счётчик не растёт. */
  verifyAuthentication(
    response: unknown,
    challenge: string,
    credential: StoredCredential,
  ): Promise<{ newCounter: number } | null>;
}

export interface CredentialRepository {
  listForUser(userId: string): Promise<StoredCredential[]>;
  find(credentialId: string): Promise<StoredCredential | null>;
  add(userId: string, c: RegistrationResult): Promise<void>;
  /** Удаляет passkey пользователя; false — нет такого ключа у этого пользователя. */
  delete(userId: string, credentialId: string): Promise<boolean>;
  /** Сдвиг счётчика только вперёд (защита от клонирования ключа). */
  touch(credentialId: string, newCounter: number): Promise<void>;
}

/** Вызов (challenge) живёт в серверной сессии пользователя или в сессии входа. */
export interface ChallengeStore {
  setForUserSession(sessionId: string, challenge: string | null): Promise<void>;
  getForUserSession(sessionId: string): Promise<string | null>;
}
