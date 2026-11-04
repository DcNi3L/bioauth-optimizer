import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { ConflictError, UnauthorizedError, ValidationError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { SESSION_STORE, type SessionStore } from '../../identity/application/ports';
import {
  CHALLENGES,
  type ChallengeStore,
  type CredentialRepository,
  CREDENTIALS,
  WEBAUTHN,
  type WebAuthnPort,
} from './ports';

/** Регистрация passkey (UC-3) и второй фактор входа сотрудника. Вызов хранится в серверной сессии. */
@Injectable()
export class PasskeyService {
  constructor(
    @Inject(WEBAUTHN) private readonly webauthn: WebAuthnPort,
    @Inject(CREDENTIALS) private readonly credentials: CredentialRepository,
    @Inject(CHALLENGES) private readonly challenges: ChallengeStore,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async registrationOptions(user: AuthUser): Promise<Record<string, unknown>> {
    // Сотрудник с уже зарегистрированным passkey добавляет новый только после входа с passkey.
    const existing = await this.credentials.listForUser(user.id);
    if (user.role !== 'subject' && existing.length > 0 && !user.mfaComplete) {
      throw new UnauthorizedError('сначала подтвердите вход существующим passkey');
    }
    const { options, challenge } = await this.webauthn.registrationOptions(user, existing);
    await this.challenges.setForUserSession(user.sessionId, challenge);
    return options;
  }

  async verifyRegistration(user: AuthUser, response: unknown): Promise<{ registered: true }> {
    const challenge = await this.challenges.getForUserSession(user.sessionId);
    if (!challenge) throw new ValidationError('нет активного запроса регистрации passkey', 'response');
    await this.challenges.setForUserSession(user.sessionId, null); // вызов одноразовый
    const result = await this.webauthn.verifyRegistration(response, challenge);
    if (!result) throw new ValidationError('passkey не прошёл проверку', 'response');
    if (await this.credentials.find(result.credentialId))
      throw new ConflictError('этот passkey уже зарегистрирован');
    await this.credentials.add(user.id, result);
    await this.audit.record({
      actorId: user.id,
      action: 'passkey.registered',
      target: user.id,
      details: { deviceType: result.deviceType, backedUp: result.backedUp },
    });
    // Сотрудник, впервые зарегистрировавший passkey при обязательном MFA, получает полный доступ в этой сессии.
    if (user.role !== 'subject' && !user.mfaComplete) await this.sessions.completeMfa(user.sessionId);
    return { registered: true };
  }

  async staffLoginOptions(user: AuthUser): Promise<Record<string, unknown>> {
    const creds = await this.credentials.listForUser(user.id);
    if (creds.length === 0) throw new ValidationError('у пользователя нет passkey', 'passkey');
    const { options, challenge } = await this.webauthn.authenticationOptions(creds);
    await this.challenges.setForUserSession(user.sessionId, challenge);
    return options;
  }

  async staffLoginVerify(user: AuthUser, response: { id: string }): Promise<{ mfaComplete: true }> {
    const challenge = await this.challenges.getForUserSession(user.sessionId);
    await this.challenges.setForUserSession(user.sessionId, null);
    const cred = await this.credentials.find(response.id);
    if (!challenge || cred?.userId !== user.id) throw new UnauthorizedError('passkey не подтверждён');
    const ok = await this.webauthn.verifyAuthentication(response, challenge, cred);
    if (!ok) throw new UnauthorizedError('passkey не подтверждён');
    await this.credentials.touch(cred.credentialId, ok.newCounter);
    await this.sessions.completeMfa(user.sessionId);
    await this.audit.record({
      actorId: user.id,
      action: 'staff.login',
      target: user.id,
      details: { factor: 'passkey' },
    });
    return { mfaComplete: true };
  }
}
