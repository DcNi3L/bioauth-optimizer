import type { AdminLoginEventDto, AdminStatsDto, AdminUserDto, Role } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import { parseUserAgent } from '../../../shared/http/user-agent';

export interface UserFilter {
  readonly q: string | null;
  readonly role: Role | null;
  readonly status: 'locked' | 'disabled' | 'active' | null;
  readonly limit: number;
  readonly offset: number;
}

/** Сторона чтения админ-панели: пользователи с агрегатами и сводка по системе. */
@Injectable()
export class AdminQuery {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  private usersBase() {
    const now = new Date();
    return this.db
      .selectFrom('app_user as u')
      .leftJoin('user_avatar as av', 'av.user_id', 'u.id')
      .select((eb) => [
        'u.id',
        'u.login',
        'u.display_name',
        'u.role',
        'u.email',
        'u.created_at',
        'u.last_login_at',
        'u.locked_until',
        'u.disabled_at',
        'av.updated_at as avatar_at',
        eb
          .exists(eb.selectFrom('face_template as f').select('f.user_id').whereRef('f.user_id', '=', 'u.id'))
          .as('has_face'),
        eb
          .exists(
            eb
              .selectFrom('consent as c')
              .select('c.id')
              .whereRef('c.user_id', '=', 'u.id')
              .where('c.revoked_at', 'is', null),
          )
          .as('has_consent'),
        eb
          .selectFrom('webauthn_credential as w')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('w.user_id', '=', 'u.id')
          .as('passkeys'),
        eb
          .selectFrom('user_session as s')
          .select((e) => e.fn.countAll<string>().as('n'))
          .whereRef('s.user_id', '=', 'u.id')
          .where('s.expires_at', '>', now)
          .as('sessions'),
      ]);
  }

  private static toDto(r: {
    id: string;
    login: string;
    display_name: string;
    role: Role;
    email: string | null;
    created_at: Date;
    last_login_at: Date | null;
    locked_until: Date | null;
    disabled_at: Date | null;
    avatar_at: Date | null;
    has_face: unknown;
    has_consent: unknown;
    passkeys: string | null;
    sessions: string | null;
  }): AdminUserDto {
    return {
      id: r.id,
      login: r.login,
      displayName: r.display_name,
      role: r.role,
      email: r.email,
      createdAt: r.created_at.toISOString(),
      lastLoginAt: r.last_login_at?.toISOString() ?? null,
      lockedUntil: r.locked_until && r.locked_until > new Date() ? r.locked_until.toISOString() : null,
      disabled: r.disabled_at !== null,
      face: !!r.has_face,
      passkeys: Number(r.passkeys ?? 0),
      consent: !!r.has_consent,
      activeSessions: Number(r.sessions ?? 0),
      avatarUrl: r.avatar_at ? `/api/v1/avatars/${r.id}?v=${r.avatar_at.getTime().toString(36)}` : null,
    };
  }

  async users(f: UserFilter): Promise<{ items: AdminUserDto[]; total: number }> {
    let q = this.usersBase();
    let c = this.db.selectFrom('app_user as u').select((eb) => eb.fn.countAll<string>().as('n'));
    if (f.q) {
      const like = `%${f.q.replace(/[%_\\]/g, (m) => `\\${m}`)}%`;
      q = q.where((eb) =>
        eb.or([
          eb('u.login', 'ilike', like),
          eb('u.display_name', 'ilike', like),
          eb('u.email', 'ilike', like),
        ]),
      );
      c = c.where((eb) =>
        eb.or([
          eb('u.login', 'ilike', like),
          eb('u.display_name', 'ilike', like),
          eb('u.email', 'ilike', like),
        ]),
      );
    }
    if (f.role) {
      q = q.where('u.role', '=', f.role);
      c = c.where('u.role', '=', f.role);
    }
    if (f.status === 'disabled') {
      q = q.where('u.disabled_at', 'is not', null);
      c = c.where('u.disabled_at', 'is not', null);
    } else if (f.status === 'locked') {
      q = q.where('u.locked_until', '>', new Date());
      c = c.where('u.locked_until', '>', new Date());
    } else if (f.status === 'active') {
      q = q.where('u.disabled_at', 'is', null);
      c = c.where('u.disabled_at', 'is', null);
    }
    const [rows, total] = await Promise.all([
      q.orderBy('u.created_at', 'desc').orderBy('u.id').limit(f.limit).offset(f.offset).execute(),
      c.executeTakeFirstOrThrow(),
    ]);
    return { items: rows.map((r) => AdminQuery.toDto(r)), total: Number(total.n) };
  }

  /** Все пользователи для выгрузки (не более limit), по фильтру списка. */
  async exportUsers(f: Omit<UserFilter, 'limit' | 'offset'>, limit: number): Promise<AdminUserDto[]> {
    const page = await this.users({ ...f, limit, offset: 0 });
    return page.items;
  }

  async user(id: string): Promise<AdminUserDto | null> {
    const r = await this.usersBase().where('u.id', '=', id).executeTakeFirst();
    return r ? AdminQuery.toDto(r) : null;
  }

  async apps(userId: string) {
    const rows = await this.db
      .selectFrom('oauth_consent as c')
      .innerJoin('oauth_client as k', 'k.client_id', 'c.client_id')
      .select(['c.client_id', 'k.name', 'c.scopes', 'c.granted_at'])
      .where('c.user_id', '=', userId)
      .orderBy('c.granted_at', 'desc')
      .execute();
    return rows.map((r) => ({
      clientId: r.client_id,
      name: r.name,
      scopes: r.scopes,
      grantedAt: r.granted_at.toISOString(),
    }));
  }

  async recentLogins(limit: number, failuresOnly: boolean): Promise<AdminLoginEventDto[]> {
    let q = this.db
      .selectFrom('login_event as e')
      .innerJoin('app_user as u', 'u.id', 'e.user_id')
      .select([
        'e.id',
        'e.at',
        'e.success',
        'e.method',
        'e.amr',
        'e.reason',
        'e.ip',
        'e.user_agent',
        'e.client_id',
        'u.id as user_id',
        'u.login',
      ])
      .orderBy('e.at', 'desc')
      .limit(limit);
    if (failuresOnly) q = q.where('e.success', '=', false);
    return (await q.execute()).map((r) => ({
      id: r.id,
      at: r.at.toISOString(),
      success: r.success,
      method: r.method,
      amr: r.amr,
      reason: r.reason,
      ip: r.ip,
      device: parseUserAgent(r.user_agent),
      clientId: r.client_id,
      userId: r.user_id,
      login: r.login,
    }));
  }

  async stats(): Promise<AdminStatsDto> {
    const now = new Date();
    const dayAgo = new Date(Date.now() - 86_400_000);
    const twoWeeks = new Date(Date.now() - 14 * 86_400_000);
    const [roles, flags, sessions, last24, byDay, byMethod, reasons, oauth] = await Promise.all([
      this.db
        .selectFrom('app_user')
        .select((eb) => ['role', eb.fn.countAll<string>().as('n')])
        .groupBy('role')
        .execute(),
      this.db
        .selectFrom('app_user as u')
        .select([
          sql<string>`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM face_template f WHERE f.user_id = u.id))`.as(
            'face',
          ),
          sql<string>`count(*) FILTER (WHERE EXISTS (SELECT 1 FROM webauthn_credential w WHERE w.user_id = u.id))`.as(
            'passkey',
          ),
          sql<string>`count(*) FILTER (WHERE u.locked_until > now())`.as('locked'),
          sql<string>`count(*) FILTER (WHERE u.disabled_at IS NOT NULL)`.as('disabled'),
        ])
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('user_session')
        .select([sql<string>`count(*)`.as('n'), sql<string>`count(DISTINCT user_id)`.as('users')])
        .where('expires_at', '>', now)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('login_event')
        .select([
          sql<string>`count(*) FILTER (WHERE success)`.as('ok'),
          sql<string>`count(*) FILTER (WHERE NOT success)`.as('bad'),
        ])
        .where('at', '>=', dayAgo)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('login_event')
        .select([
          sql<string>`to_char(date_trunc('day', at AT TIME ZONE 'UTC'), 'YYYY-MM-DD')`.as('day'),
          sql<string>`count(*) FILTER (WHERE success)`.as('ok'),
          sql<string>`count(*) FILTER (WHERE NOT success)`.as('bad'),
        ])
        .where('at', '>=', twoWeeks)
        .groupBy(sql`1`)
        .orderBy(sql`1`)
        .execute(),
      this.db
        .selectFrom('login_event')
        .select((eb) => ['method', eb.fn.countAll<string>().as('n')])
        .where('success', '=', true)
        .where('at', '>=', twoWeeks)
        .groupBy('method')
        .execute(),
      this.db
        .selectFrom('login_event')
        .select((eb) => ['reason', eb.fn.countAll<string>().as('n')])
        .where('success', '=', false)
        .where('reason', 'is not', null)
        .where('at', '>=', twoWeeks)
        .groupBy('reason')
        .orderBy('n', 'desc')
        .limit(6)
        .execute(),
      this.db
        .selectFrom('oauth_client')
        .select([
          sql<string>`count(*)`.as('clients'),
          sql<string>`(SELECT count(*) FROM oauth_consent)`.as('grants'),
        ])
        .executeTakeFirstOrThrow(),
    ]);
    // Непрерывный ряд за 14 дней: пропущенные дни — нули.
    const map = new Map(byDay.map((d) => [d.day, d]));
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date(Date.now() - (13 - i) * 86_400_000).toISOString().slice(0, 10);
      const r = map.get(d);
      return { day: d, success: Number(r?.ok ?? 0), failure: Number(r?.bad ?? 0) };
    });
    const byRole = Object.fromEntries(roles.map((r) => [r.role, Number(r.n)]));
    return {
      users: {
        total: Object.values(byRole).reduce((a, b) => a + b, 0),
        byRole,
        withFace: Number(flags.face),
        withPasskey: Number(flags.passkey),
        locked: Number(flags.locked),
        disabled: Number(flags.disabled),
      },
      sessions: { active: Number(sessions.n), activeUsers: Number(sessions.users) },
      logins: {
        last24h: { success: Number(last24.ok), failure: Number(last24.bad) },
        byDay: days,
        byMethod: Object.fromEntries(byMethod.map((m) => [m.method, Number(m.n)])),
        topReasons: reasons.map((r) => ({ reason: r.reason ?? '', n: Number(r.n) })),
      },
      oauth: { clients: Number(oauth.clients), activeGrants: Number(oauth.grants) },
    };
  }

  async setUser(
    id: string,
    patch: { role?: Role; disabled?: boolean; unlock?: boolean; displayName?: string },
  ): Promise<boolean> {
    const r = await this.db
      .updateTable('app_user')
      .set({
        ...(patch.role && { role: patch.role }),
        ...(patch.displayName && { display_name: patch.displayName }),
        ...(patch.disabled !== undefined && { disabled_at: patch.disabled ? new Date() : null }),
        ...(patch.unlock && { locked_until: null, failed_attempts: 0 }),
      })
      .where('id', '=', id)
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }

  async deleteSessions(userId: string): Promise<number> {
    const r = await this.db.deleteFrom('user_session').where('user_id', '=', userId).executeTakeFirst();
    return Number(r.numDeletedRows);
  }

  /** Отзыв refresh-токенов приложений: отключённый пользователь не продлевает доступ сторонних сервисов. */
  async revokeOauthTokens(userId: string): Promise<void> {
    await this.db
      .updateTable('oauth_refresh_token')
      .set({ revoked_at: new Date() })
      .where('user_id', '=', userId)
      .where('revoked_at', 'is', null)
      .execute();
  }

  async emailTaken(email: string): Promise<boolean> {
    const r = await this.db
      .selectFrom('app_user')
      .select('id')
      .where(sql<boolean>`lower(email) = lower(${email})`)
      .executeTakeFirst();
    return !!r;
  }

  async countAdmins(excludeId: string): Promise<number> {
    const r = await this.db
      .selectFrom('app_user')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('role', '=', 'admin')
      .where('disabled_at', 'is', null)
      .where('id', '!=', excludeId)
      .executeTakeFirstOrThrow();
    return Number(r.n);
  }
}
