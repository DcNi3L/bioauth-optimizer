import { Inject, Injectable } from '@nestjs/common';

import { hashSessionToken, newSessionToken } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { clientInfo } from '../../../shared/http/request-context';
import {
  LOGIN_EVENTS,
  type LoginEventInput,
  type LoginEvents,
  SESSION_STORE,
  type SessionStore,
  USER_REPOSITORY,
  type UserRepository,
} from './ports';

export interface IssuedSession {
  readonly token: string;
  readonly maxAgeMs: number;
}

export interface IssueOptions {
  readonly method: LoginEventInput['method'];
  /** Способы проверки (RFC 8176): face, hwk, pwd, mfa. */
  readonly amr: readonly string[];
}

/**
 * Выпуск сессии: случайный токен в cookie, в БД — только его sha256, устройство и способ входа.
 * Каждый выпуск записывается в историю входов пользователя.
 */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(USER_REPOSITORY) private readonly users: UserRepository,
    @Inject(LOGIN_EVENTS) private readonly events: LoginEvents,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(userId: string, mfaComplete: boolean, opts: IssueOptions): Promise<IssuedSession> {
    const token = newSessionToken();
    const maxAgeMs = this.config.SESSION_TTL_HOURS * 3600_000;
    const { ip, userAgent } = clientInfo();
    await this.sessions.create(
      userId,
      hashSessionToken(token),
      mfaComplete,
      new Date(Date.now() + maxAgeMs),
      {
        amr: opts.amr,
        ip,
        userAgent,
      },
    );
    await Promise.all([
      this.users.touchLogin(userId),
      this.events.record({ userId, success: true, method: opts.method, amr: opts.amr }),
    ]);
    return { token, maxAgeMs };
  }
}
