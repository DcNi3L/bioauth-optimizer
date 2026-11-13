import type { RegisterSubjectRequest } from '@bioauth/contracts';
import { Inject, Injectable, Logger, type OnApplicationBootstrap } from '@nestjs/common';

import { hashSessionToken } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import {
  ConflictError,
  ForbiddenError,
  TooManyAttemptsError,
  UnauthorizedError,
} from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { MeQuery } from '../infrastructure/me.query';
import {
  LOGIN_EVENTS,
  type LoginEvents,
  PASSWORD_HASHER,
  type PasswordHasher,
  SESSION_STORE,
  type SessionStore,
  USER_REPOSITORY,
  type UserRepository,
} from './ports';
import { type IssuedSession, SessionIssuer } from './session-issuer';

const STAFF_LOCK_THRESHOLD = 5;
const STAFF_LOCK_MS = 15 * 60_000;

/** Самостоятельная регистрация субъекта (участника испытаний): создаёт пользователя и сессию. */
@Injectable()
export class RegisterSubjectUseCase {
  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    private readonly issuer: SessionIssuer,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async execute(cmd: RegisterSubjectRequest): Promise<IssuedSession> {
    const user = await this.users.create({
      login: cmd.login,
      displayName: cmd.displayName,
      role: 'subject',
      passwordHash: null,
    });
    if (!user) throw new ConflictError(`логин «${cmd.login}» уже занят`);
    await this.audit.record({ actorId: user.id, action: 'subject.registered', target: user.id });
    return this.issuer.issue(user.id, true, { method: 'register', amr: [] });
  }
}

/**
 * Вход сотрудника по паролю. Если у сотрудника есть passkey (или он обязателен), сессия создаётся
 * с mfaComplete = false и требует второго шага; админка без него недоступна.
 */
@Injectable()
export class PasswordLoginUseCase {
  private dummyHash: Promise<string> | null = null;

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    private readonly issuer: SessionIssuer,
    private readonly me: MeQuery,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    @Inject(LOGIN_EVENTS) private readonly events: LoginEvents,
  ) {}

  async execute(login: string, password: string): Promise<IssuedSession & { mfaRequired: boolean }> {
    const user = await this.users.findByLogin(login);
    if (user?.lockedUntil && user.lockedUntil > new Date()) {
      throw new TooManyAttemptsError('вход временно заблокирован', user.lockedUntil);
    }
    // Хэш считается и для несуществующего логина: время ответа не выдаёт, есть ли такой пользователь.
    this.dummyHash ??= this.hasher.hash('dummy-password-for-timing');
    const ok = await this.hasher.verify(password, user?.passwordHash ?? (await this.dummyHash));
    if (!user || user.role === 'subject' || !user.passwordHash || !ok) {
      if (user && user.role !== 'subject') {
        const r = await this.users.registerFailure(
          user.id,
          STAFF_LOCK_THRESHOLD,
          new Date(Date.now() + STAFF_LOCK_MS),
        );
        if (r.lockedUntil && r.failures >= STAFF_LOCK_THRESHOLD) {
          await this.audit.record({
            actorId: null,
            action: 'user.locked',
            target: user.id,
            details: { failures: r.failures },
          });
        }
      }
      if (user)
        await this.events.record({
          userId: user.id,
          success: false,
          method: 'password',
          amr: ['pwd'],
          reason: 'BAD_CREDENTIALS',
        });
      throw new UnauthorizedError('неверный логин или пароль');
    }
    if (user.disabled) {
      // Сообщаем об отключении только после верного пароля — иначе ответ выдавал бы состояние учётной записи.
      await this.events.record({
        userId: user.id,
        success: false,
        method: 'password',
        amr: ['pwd'],
        reason: 'ACCOUNT_DISABLED',
      });
      throw new ForbiddenError('учётная запись отключена администратором');
    }
    await this.users.resetFailures(user.id);
    const [passkeys, totp] = await Promise.all([this.me.passkeyCount(user.id), this.me.totpEnabled(user.id)]);
    const mfaRequired = passkeys > 0 || totp || this.config.REQUIRE_STAFF_PASSKEY;
    await this.audit.record({
      actorId: user.id,
      action: 'staff.login',
      target: user.id,
      details: { factor: 'password' },
    });
    return {
      ...(await this.issuer.issue(user.id, !mfaRequired, { method: 'password', amr: ['pwd'] })),
      mfaRequired,
    };
  }
}

@Injectable()
export class LogoutUseCase {
  constructor(@Inject(SESSION_STORE) private readonly sessions: SessionStore) {}

  async execute(token: string | undefined): Promise<void> {
    if (token) await this.sessions.deleteByTokenHash(hashSessionToken(token));
  }
}

/** Первый администратор из ADMIN_LOGIN / ADMIN_PASSWORD, если администраторов ещё нет. */
@Injectable()
export class BootstrapAdmin implements OnApplicationBootstrap {
  private readonly logger = new Logger('BootstrapAdmin');

  constructor(
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(PASSWORD_HASHER) private readonly hasher: PasswordHasher,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    if (!this.config.ADMIN_PASSWORD || (await this.users.countByRole('admin')) > 0) return;
    const created = await this.users.create({
      login: this.config.ADMIN_LOGIN,
      displayName: 'Администратор безопасности',
      role: 'admin',
      passwordHash: await this.hasher.hash(this.config.ADMIN_PASSWORD),
    });
    if (created) this.logger.log(`создан администратор «${created.login}»`);
  }
}
