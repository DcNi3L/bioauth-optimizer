import type { Role } from '@bioauth/contracts';

export const USER_REPOSITORY = Symbol('USER_REPOSITORY');
export const SESSION_STORE = Symbol('SESSION_STORE');
export const PASSWORD_HASHER = Symbol('PASSWORD_HASHER');
export const LOGIN_EVENTS = Symbol('LOGIN_EVENTS');
export const AVATAR_STORE = Symbol('AVATAR_STORE');

export interface UserRecord {
  readonly id: string;
  readonly login: string;
  readonly displayName: string;
  readonly role: Role;
  readonly passwordHash: string | null;
  readonly failedAttempts: number;
  readonly lockedUntil: Date | null;
  /** Учётная запись отключена администратором: вход и выдача токенов запрещены. */
  readonly disabled: boolean;
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
  touchLogin(id: string): Promise<void>;
  /** false — почта уже занята другим пользователем. */
  updateProfile(id: string, patch: { displayName?: string; email?: string | null }): Promise<boolean>;
}

export interface LoginEventInput {
  readonly userId: string;
  readonly success: boolean;
  readonly method: 'register' | 'password' | 'face' | 'passkey' | 'oidc' | 'totp' | 'recovery';
  readonly amr?: readonly string[];
  readonly reason?: string | null;
  readonly clientId?: string | null;
}

export interface LoginEventRow {
  readonly id: string;
  readonly at: Date;
  readonly success: boolean;
  readonly method: LoginEventInput['method'];
  readonly amr: string[];
  readonly reason: string | null;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly clientId: string | null;
}

/** История входов: и успешных, и отклонённых; адрес и браузер берутся из контекста запроса. */
export interface LoginEvents {
  record(e: LoginEventInput): Promise<void>;
  forUser(userId: string, limit: number): Promise<LoginEventRow[]>;
}

export interface SessionMeta {
  readonly amr: readonly string[];
  readonly ip: string | null;
  readonly userAgent: string | null;
}

export interface SessionRow {
  readonly id: string;
  readonly createdAt: Date;
  readonly lastSeenAt: Date;
  readonly expiresAt: Date;
  readonly ip: string | null;
  readonly userAgent: string | null;
  readonly amr: string[];
  readonly mfa: boolean;
}

export interface SessionStore {
  create(
    userId: string,
    tokenHash: string,
    mfaComplete: boolean,
    expiresAt: Date,
    meta: SessionMeta,
  ): Promise<string>;
  /** Второй фактор подтверждён: mfa_complete и способ в amr. */
  completeMfa(sessionId: string, method?: string): Promise<void>;
  listForUser(userId: string): Promise<SessionRow[]>;
  /** false — сессия не найдена или чужая. */
  deleteOwned(userId: string, sessionId: string): Promise<boolean>;
  deleteOthers(userId: string, keepSessionId: string): Promise<number>;
  deleteByTokenHash(tokenHash: string): Promise<void>;
  deleteForUser(userId: string): Promise<void>;
}

export interface PasswordHasher {
  hash(password: string): Promise<string>;
  verify(password: string, stored: string): Promise<boolean>;
}

export interface Avatar {
  readonly mime: 'image/png' | 'image/jpeg' | 'image/webp';
  readonly data: Buffer;
  readonly updatedAt: Date;
}

export interface AvatarStore {
  get(userId: string): Promise<Avatar | null>;
  put(userId: string, mime: Avatar['mime'], data: Buffer): Promise<void>;
  delete(userId: string): Promise<boolean>;
}
