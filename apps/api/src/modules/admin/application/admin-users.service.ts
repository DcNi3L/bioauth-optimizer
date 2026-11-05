import type { AdminCreateUser, AdminUpdateUser, AdminUserDetailDto, AdminUserDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { ConflictError, ForbiddenError, NotFoundError } from '../../../shared/errors';
import { parseUserAgent } from '../../../shared/http/user-agent';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  LOGIN_EVENTS,
  type LoginEvents,
  PASSWORD_HASHER,
  type PasswordHasher,
  SESSION_STORE,
  type SessionStore,
  USER_REPOSITORY,
  type UserRepository,
} from '../../identity/application/ports';
import { AdminQuery } from '../infrastructure/admin.query';

/** Управление пользователями: роли, блокировка и отключение, сессии, создание сотрудников. */
@Injectable()
export class AdminUsersService {
  constructor(
    private readonly query: AdminQuery,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(LOGIN_EVENTS) private readonly events: LoginEvents,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async detail(id: string): Promise<AdminUserDetailDto> {
    const user = await this.query.user(id);
    if (!user) throw new NotFoundError('пользователь не найден');
    const [sessions, history, apps] = await Promise.all([
      this.sessions.listForUser(id),
      this.events.forUser(id, 30),
      this.query.apps(id),
    ]);
    return {
      user,
      sessions: sessions.map((s) => ({
        id: s.id,
        createdAt: s.createdAt.toISOString(),
        lastSeenAt: s.lastSeenAt.toISOString(),
        expiresAt: s.expiresAt.toISOString(),
        ip: s.ip,
        device: parseUserAgent(s.userAgent),
        amr: s.amr,
        mfa: s.mfa,
      })),
      history: history.map((e) => ({
        id: e.id,
        at: e.at.toISOString(),
        success: e.success,
        method: e.method,
        amr: e.amr,
        reason: e.reason,
        ip: e.ip,
        device: parseUserAgent(e.userAgent),
        clientId: e.clientId,
      })),
      apps,
    };
  }

  async update(actor: AuthUser, id: string, patch: AdminUpdateUser): Promise<AdminUserDto> {
    const target = await this.query.user(id);
    if (!target) throw new NotFoundError('пользователь не найден');
    const demotesAdmin =
      target.role === 'admin' && ((patch.role && patch.role !== 'admin') || patch.disabled === true);
    if (id === actor.id && (demotesAdmin || patch.disabled))
      throw new ForbiddenError('нельзя понизить или отключить самого себя');
    if (demotesAdmin && (await this.query.countAdmins(id)) === 0)
      throw new ConflictError('должен остаться хотя бы один администратор');
    if (patch.role && patch.role !== 'subject' && target.role === 'subject') {
      throw new ConflictError(
        'субъекта нельзя сделать сотрудником: создайте учётную запись сотрудника с паролем',
      );
    }
    await this.query.setUser(id, patch);
    if (patch.disabled || (patch.role && patch.role !== target.role)) await this.query.deleteSessions(id);
    if (patch.disabled) await this.query.revokeOauthTokens(id);
    await this.audit.record({ actorId: actor.id, action: 'user.updated', target: id, details: { ...patch } });
    return (await this.query.user(id))!;
  }

  async revokeSessions(actor: AuthUser, id: string): Promise<number> {
    const n = await this.query.deleteSessions(id);
    await this.audit.record({
      actorId: actor.id,
      action: 'session.revoked',
      target: id,
      details: { all: n },
    });
    return n;
  }

  async create(actor: AuthUser, cmd: AdminCreateUser & { email: string | null }): Promise<AdminUserDto> {
    // Почта проверяется до создания: иначе при конфликте осталась бы учётная запись без почты.
    if (cmd.email && (await this.query.emailTaken(cmd.email)))
      throw new ConflictError('эта почта уже используется');
    const created = await this.users.create({
      login: cmd.login,
      displayName: cmd.displayName,
      role: cmd.role,
      passwordHash: await this.hasher.hash(cmd.password),
    });
    if (!created) throw new ConflictError(`логин «${cmd.login}» уже занят`);
    if (cmd.email && !(await this.users.updateProfile(created.id, { email: cmd.email }))) {
      throw new ConflictError('эта почта уже используется');
    }
    await this.audit.record({
      actorId: actor.id,
      action: 'user.created',
      target: created.id,
      details: { role: cmd.role },
    });
    return (await this.query.user(created.id))!;
  }
}
