import { Inject, Injectable } from '@nestjs/common';

import { hashSessionToken, newSessionToken } from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { SESSION_STORE, type SessionStore } from './ports';

export interface IssuedSession {
  readonly token: string;
  readonly maxAgeMs: number;
}

/** Выпуск сессии: случайный токен в cookie, в БД — только его sha256. Используется входом всех видов. */
@Injectable()
export class SessionIssuer {
  constructor(
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  async issue(userId: string, mfaComplete: boolean): Promise<IssuedSession> {
    const token = newSessionToken();
    const maxAgeMs = this.config.SESSION_TTL_HOURS * 3600_000;
    await this.sessions.create(userId, hashSessionToken(token), mfaComplete, new Date(Date.now() + maxAgeMs));
    return { token, maxAgeMs };
  }
}
