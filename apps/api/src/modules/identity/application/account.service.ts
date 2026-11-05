import type { LoginEventDto, UpdateProfileRequest, UserSessionDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { ConflictError, NotFoundError, ValidationError } from '../../../shared/errors';
import { parseUserAgent } from '../../../shared/http/user-agent';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  type Avatar,
  AVATAR_STORE,
  type AvatarStore,
  LOGIN_EVENTS,
  type LoginEvents,
  SESSION_STORE,
  type SessionStore,
  USER_REPOSITORY,
  type UserRepository,
} from './ports';

const MAX_AVATAR_BYTES = 1024 * 1024;

/** Сигнатуры форматов: тип изображения определяется по содержимому, а не по заявленному MIME. */
export function sniffImage(data: Buffer): Avatar['mime'] | null {
  if (
    data.length > 8 &&
    data.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  )
    return 'image/png';
  if (data.length > 3 && data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'image/jpeg';
  if (data.length > 12 && data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP')
    return 'image/webp';
  return null;
}

/** Учётная запись пользователя: профиль, аватар, активные сессии и устройства, история входов. */
@Injectable()
export class AccountService {
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(LOGIN_EVENTS) private readonly events: LoginEvents,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(AVATAR_STORE) private readonly avatars: AvatarStore,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async updateProfile(user: AuthUser, patch: UpdateProfileRequest): Promise<void> {
    if (!(await this.users.updateProfile(user.id, patch)))
      throw new ConflictError('эта почта уже используется');
  }

  async sessionsOf(user: AuthUser): Promise<UserSessionDto[]> {
    return (await this.sessions.listForUser(user.id)).map((s) => ({
      id: s.id,
      current: s.id === user.sessionId,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
      expiresAt: s.expiresAt.toISOString(),
      ip: s.ip,
      device: parseUserAgent(s.userAgent),
      amr: s.amr,
      mfa: s.mfa,
    }));
  }

  async revokeSession(user: AuthUser, sessionId: string): Promise<void> {
    if (sessionId === user.sessionId) throw new ValidationError('текущую сессию завершает выход', 'id');
    if (!(await this.sessions.deleteOwned(user.id, sessionId))) throw new NotFoundError('сессия не найдена');
    await this.audit.record({
      actorId: user.id,
      action: 'session.revoked',
      target: user.id,
      details: { sessionId },
    });
  }

  async revokeOthers(user: AuthUser): Promise<number> {
    const n = await this.sessions.deleteOthers(user.id, user.sessionId);
    if (n > 0)
      await this.audit.record({
        actorId: user.id,
        action: 'session.revoked',
        target: user.id,
        details: { others: n },
      });
    return n;
  }

  async history(user: AuthUser, limit: number): Promise<LoginEventDto[]> {
    return (await this.events.forUser(user.id, limit)).map((e) => ({
      id: e.id,
      at: e.at.toISOString(),
      success: e.success,
      method: e.method,
      amr: e.amr,
      reason: e.reason,
      ip: e.ip,
      device: parseUserAgent(e.userAgent),
      clientId: e.clientId,
    }));
  }

  async setAvatar(user: AuthUser, dataUrl: string): Promise<void> {
    const data = Buffer.from(dataUrl.slice(dataUrl.indexOf(',') + 1), 'base64');
    if (data.length > MAX_AVATAR_BYTES) throw new ValidationError('изображение больше 1 МБ', 'image');
    const mime = sniffImage(data);
    if (!mime) throw new ValidationError('ожидается изображение PNG, JPEG или WebP', 'image');
    await this.avatars.put(user.id, mime, data);
  }

  async deleteAvatar(user: AuthUser): Promise<void> {
    await this.avatars.delete(user.id);
  }

  avatar(userId: string): Promise<Avatar | null> {
    return this.avatars.get(userId);
  }
}
