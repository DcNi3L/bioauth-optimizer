import type { Role } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import type { AuthUser, SessionReader } from '../../../shared/auth/auth';
import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { AppUserTable } from '../../../shared/database/schema';
import { clientInfo } from '../../../shared/http/request-context';
import type {
  LoginEventInput,
  LoginEventRow,
  LoginEvents,
  SessionMeta,
  SessionRow,
  SessionStore,
  UserRecord,
  UserRepository,
} from '../application/ports';

type UserRow = Pick<
  AppUserTable,
  'login' | 'display_name' | 'role' | 'password_hash' | 'locked_until' | 'disabled_at'
> & {
  id: string;
  failed_attempts: number;
};

const toUser = (r: UserRow): UserRecord => ({
  id: r.id,
  login: r.login,
  displayName: r.display_name,
  role: r.role,
  passwordHash: r.password_hash,
  failedAttempts: r.failed_attempts,
  lockedUntil: r.locked_until,
  disabled: r.disabled_at !== null,
});

const USER_COLUMNS = [
  'id',
  'login',
  'display_name',
  'role',
  'password_hash',
  'failed_attempts',
  'locked_until',
  'disabled_at',
] as const;

@Injectable()
export class KyselyUserRepository implements UserRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async findByLogin(login: string): Promise<UserRecord | null> {
    const r = await this.db
      .selectFrom('app_user')
      .select(USER_COLUMNS)
      .where('login', '=', login)
      .executeTakeFirst();
    return r ? toUser(r) : null;
  }

  async findById(id: string): Promise<UserRecord | null> {
    const r = await this.db
      .selectFrom('app_user')
      .select(USER_COLUMNS)
      .where('id', '=', id)
      .executeTakeFirst();
    return r ? toUser(r) : null;
  }

  async create(u: { login: string; displayName: string; role: Role; passwordHash: string | null }) {
    const r = await this.db
      .insertInto('app_user')
      .values({ login: u.login, display_name: u.displayName, role: u.role, password_hash: u.passwordHash })
      .onConflict((oc) => oc.constraint('app_user_login_key').doNothing())
      .returning(USER_COLUMNS)
      .executeTakeFirst();
    return r ? toUser(r) : null;
  }

  async countByRole(role: Role): Promise<number> {
    const r = await this.db
      .selectFrom('app_user')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('role', '=', role)
      .executeTakeFirstOrThrow();
    return Number(r.n);
  }

  async registerFailure(id: string, threshold: number, lockUntil: Date) {
    // Атомарно: одновременные неудачные попытки не теряют приращения.
    const r = await this.db
      .updateTable('app_user')
      .set((eb) => ({
        failed_attempts: eb('failed_attempts', '+', 1),
        locked_until: sql<Date | null>`CASE WHEN failed_attempts + 1 >= ${threshold} THEN ${lockUntil}::timestamptz ELSE locked_until END`,
      }))
      .where('id', '=', id)
      .returning(['failed_attempts', 'locked_until'])
      .executeTakeFirstOrThrow();
    return { failures: r.failed_attempts, lockedUntil: r.locked_until };
  }

  async resetFailures(id: string): Promise<void> {
    await this.db
      .updateTable('app_user')
      .set({ failed_attempts: 0, locked_until: null })
      .where('id', '=', id)
      .execute();
  }

  async touchLogin(id: string): Promise<void> {
    await this.db.updateTable('app_user').set({ last_login_at: new Date() }).where('id', '=', id).execute();
  }

  async updateProfile(id: string, patch: { displayName?: string; email?: string | null }): Promise<boolean> {
    if (patch.displayName === undefined && patch.email === undefined) return true;
    try {
      await this.db
        .updateTable('app_user')
        .set({
          ...(patch.displayName !== undefined && { display_name: patch.displayName }),
          ...(patch.email !== undefined && { email: patch.email }),
        })
        .where('id', '=', id)
        .execute();
      return true;
    } catch (err) {
      if ((err as { code?: string }).code === '23505') return false; // уникальность почты
      throw err;
    }
  }
}

/** История входов: адрес и браузер — из контекста текущего запроса. */
@Injectable()
export class KyselyLoginEvents implements LoginEvents {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async record(e: LoginEventInput): Promise<void> {
    const { ip, userAgent } = clientInfo();
    await this.db
      .insertInto('login_event')
      .values({
        user_id: e.userId,
        success: e.success,
        method: e.method,
        amr: [...(e.amr ?? [])],
        reason: e.reason ?? null,
        client_id: e.clientId ?? null,
        ip,
        user_agent: userAgent,
      })
      .execute();
  }

  async forUser(userId: string, limit: number): Promise<LoginEventRow[]> {
    const rows = await this.db
      .selectFrom('login_event')
      .selectAll()
      .where('user_id', '=', userId)
      .orderBy('at', 'desc')
      .limit(limit)
      .execute();
    return rows.map((r) => ({
      id: r.id,
      at: r.at,
      success: r.success,
      method: r.method,
      amr: r.amr,
      reason: r.reason,
      ip: r.ip,
      userAgent: r.user_agent,
      clientId: r.client_id,
    }));
  }
}

/** Сессии пользователей; также узкий порт чтения для глобального AuthGuard. */
@Injectable()
export class KyselySessionStore implements SessionStore, SessionReader {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async create(
    userId: string,
    tokenHash: string,
    mfa: boolean,
    expiresAt: Date,
    meta: SessionMeta,
  ): Promise<string> {
    const r = await this.db
      .insertInto('user_session')
      .values({
        user_id: userId,
        token_hash: tokenHash,
        mfa_complete: mfa,
        expires_at: expiresAt,
        amr: [...meta.amr],
        mfa_verified_at: mfa && meta.amr.includes('mfa') ? new Date(Date.now()) : null,
        ip: meta.ip,
        user_agent: meta.userAgent,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return r.id;
  }

  async completeMfa(sessionId: string, method = 'hwk'): Promise<void> {
    await this.db
      .updateTable('user_session')
      .set({
        mfa_complete: true,
        mfa_verified_at: new Date(Date.now()),
        amr: sql<
          string[]
        >`(SELECT array_agg(DISTINCT m) FROM unnest(amr || ARRAY[${method}, 'mfa']::text[]) AS m)`,
      })
      .where('id', '=', sessionId)
      .execute();
  }

  async listForUser(userId: string): Promise<SessionRow[]> {
    const rows = await this.db
      .selectFrom('user_session')
      .select(['id', 'created_at', 'last_seen_at', 'expires_at', 'ip', 'user_agent', 'amr', 'mfa_complete'])
      .where('user_id', '=', userId)
      .where('expires_at', '>', new Date())
      .orderBy('last_seen_at', 'desc')
      .execute();
    return rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at,
      lastSeenAt: r.last_seen_at,
      expiresAt: r.expires_at,
      ip: r.ip,
      userAgent: r.user_agent,
      amr: r.amr,
      mfa: r.mfa_complete,
    }));
  }

  async deleteOwned(userId: string, sessionId: string): Promise<boolean> {
    const r = await this.db
      .deleteFrom('user_session')
      .where('id', '=', sessionId)
      .where('user_id', '=', userId)
      .executeTakeFirst();
    return r.numDeletedRows > 0n;
  }

  async deleteOthers(userId: string, keepSessionId: string): Promise<number> {
    const r = await this.db
      .deleteFrom('user_session')
      .where('user_id', '=', userId)
      .where('id', '!=', keepSessionId)
      .executeTakeFirst();
    return Number(r.numDeletedRows);
  }

  async deleteByTokenHash(tokenHash: string): Promise<void> {
    await this.db.deleteFrom('user_session').where('token_hash', '=', tokenHash).execute();
  }

  async deleteForUser(userId: string): Promise<void> {
    await this.db.deleteFrom('user_session').where('user_id', '=', userId).execute();
  }

  async findUserByTokenHash(tokenHash: string): Promise<AuthUser | null> {
    const r = await this.db
      .selectFrom('user_session as s')
      .innerJoin('app_user as u', 'u.id', 's.user_id')
      .select([
        's.id as sessionId',
        's.mfa_complete',
        's.last_seen_at',
        's.amr',
        's.created_at as auth_time',
        's.mfa_verified_at',
        'u.id',
        'u.login',
        'u.display_name',
        'u.role',
      ])
      .where('s.token_hash', '=', tokenHash)
      .where('s.expires_at', '>', new Date())
      .where('u.disabled_at', 'is', null)
      .executeTakeFirst();
    // Последняя активность — не чаще раза в минуту, чтобы не писать в БД на каждый запрос.
    if (r && Date.now() - r.last_seen_at.getTime() > 60_000) {
      await this.db
        .updateTable('user_session')
        .set({ last_seen_at: new Date() })
        .where('id', '=', r.sessionId)
        .execute();
    }
    return r
      ? {
          id: r.id,
          login: r.login,
          displayName: r.display_name,
          role: r.role,
          sessionId: r.sessionId,
          mfaComplete: r.mfa_complete,
          amr: r.amr,
          authTime: r.auth_time,
          mfaAt: r.mfa_verified_at,
        }
      : null;
  }
}
