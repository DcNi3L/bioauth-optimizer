import type { Role } from '@bioauth/contracts';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_STORE = Symbol('SESSION_STORE');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');

export interface UserRecord {
  readonly id: string;
  readonly login: string;
  readonly displayName: string;
  readonly role: Role;
  readonly passwordHash: string | null;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
}

export interface UserRepository {
  findByLogin(login: string): Promise<UserRecord | null>;
  findById(id: string): Promise<UserRecord | null>;
  /** null — логин занят. */
  create(user: {
    login: string;
    displayName: string;
    role: Role;
    passwordHash: string | null;
  }): Promise<UserRecord | null>;
  countByRole(role: Role): Promise<number>;
  /** Неудачная попытка входа: счётчик +1; при достижении порога — блокировка до lockUntil. */
  registerFailure(
    id: string,
    threshold: number,
    lockUntil: Date,
  ): Promise<{ failures: number; lockedUntil: Date | null }>;
  resetFailures(id: string): Promise<void>;
}

export interface SessionStore {
  create(userId: string, tokenHash: string, mfaComplete: boolean, expiresAt: Date): Promise<string>;
  completeMfa(sessionId: string): Promise<void>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteForUser(userId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}
