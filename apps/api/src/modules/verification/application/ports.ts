import type { LivenessCommand } from '@bioauth/contracts';

import type { AuthSessionStateDb } from '../../../shared/database/schema';

export const AUTH_SESSIONS = Symbol('AUTH_SESSIONS');

export interface AuthSessionRecord {
  readonly id: string;
  readonly userId: string | null;
  readonly policyId: string;
  readonly commands: LivenessCommand[];
  readonly stepIndex: number;
  readonly failures: number;
  readonly state: AuthSessionStateDb;
  readonly webauthnChallenge: string | null;
  readonly expiresAt: Date;
}

export interface AuthSessionRepository {
  create(s: {
    userId: string | null;
    policyId: string;
    nonce: string;
    commands: LivenessCommand[];
    expiresAt: Date;
  }): Promise<string>;
  find(id: string): Promise<AuthSessionRecord | null>;
  /**
   * Условное обновление: применяется, только если сессия всё ещё в ожидаемом шаге и счётчике неудач
   * (защита от параллельных отправок одной сессии). false — состояние уже изменилось.
   */
  update(
    id: string,
    expected: { stepIndex: number; failures: number },
    patch: Partial<{
      stepIndex: number;
      failures: number;
      state: AuthSessionStateDb;
      commands: LivenessCommand[];
      webauthnChallenge: string | null;
      faceAccepted: boolean;
    }>,
  ): Promise<boolean>;
  setChallenge(id: string, challenge: string | null): Promise<void>;
  /** Последняя принятая попытка по лицу в сессии — её оценка становится genuine после второго фактора. */
  acceptedFaceAttempt(sessionId: string): Promise<{ id: string; score: number; modelVersion: string } | null>;
}
