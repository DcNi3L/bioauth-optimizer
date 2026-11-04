import type { Role } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import type { AuthUser, SessionReader } from '../../../shared/auth/auth';
import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { AppUserTable } from '../../../shared/database/schema';
import type { SessionStore, UserRecord, UserRepository } from '../application/ports';

type UserRow = Pick<AppUserTable, 'login' | 'display_name' | 'role' | 'password_hash' | 'locked_until'> & {
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
});

const USER_COLUMNS = [
  'id',
  'login',
  'display_name',
  'role',
  'password_hash',
  'failed_attempts',
  'locked_until',
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
}

/** Сессии пользователей; также узкий порт чтения для глобального AuthGuard. */
@Injectable()
export class KyselySessionStore implements SessionStore, SessionReader {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async create(userId: string, tokenHash: string, mfa: boolean, expiresAt: Date): Promise<string> {
    const r = await this.db
      .insertInto('user_session')
      .values({ user_id: userId, token_hash: tokenHash, mfa_complete: mfa, expires_at: expiresAt })
      .returning('id')
      .executeTakeFirstOrThrow();
    return r.id;
  }

  async completeMfa(sessionId: string): Promise<void> {
    await this.db
      .updateTable('user_session')
      .set({ mfa_complete: true })
      .where('id', '=', sessionId)
      .execute();
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
      .select(['s.id as sessionId', 's.mfa_complete', 'u.id', 'u.login', 'u.display_name', 'u.role'])
      .where('s.token_hash', '=', tokenHash)
      .where('s.expires_at', '>', new Date())
      .executeTakeFirst();
    return r
      ? {
          id: r.id,
          login: r.login,
          displayName: r.display_name,
          role: r.role,
          sessionId: r.sessionId,
          mfaComplete: r.mfa_complete,
        }
      : null;
  }
}
