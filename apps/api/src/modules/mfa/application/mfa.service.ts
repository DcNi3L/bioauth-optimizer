import { scrypt as scryptCb } from 'node:crypto';
import { promisify } from 'node:util';

import type { MfaStatusDto, TotpSetupDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { SECRET_BOX, type SecretBox } from '../../../shared/crypto/secret-box';
import {
  ConflictError,
  TooManyAttemptsError,
  UnauthorizedError,
  ValidationError,
} from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  LOGIN_EVENTS,
  type LoginEvents,
  SESSION_STORE,
  type SessionStore,
} from '../../identity/application/ports';
import { generateRecoveryCode, normalizeRecoveryCode, RECOVERY_CODES } from '../domain/recovery-code';
import { base32Encode, generateTotpSecret, otpauthUri, totpCounter, verifyTotp } from '../domain/totp';
import { MFA_REPOSITORY, type MfaRepository, type TotpRow } from './ports';

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

const ISSUER = 'BioAuth Optimizer';
/** Пять неверных кодов подряд — блокировка проверки на 5 минут. */
export const MAX_FAILURES = 5;
export const LOCK_MS = 5 * 60_000;

/**
 * Приложение-аутентификатор (TOTP) и коды восстановления: второй фактор сотрудника вместо passkey
 * и запасной путь, когда нет камеры. Секрет — AES-256-GCM, коды восстановления — scrypt-хэши.
 */
@Injectable()
export class MfaService {
  constructor(
    @Inject(MFA_REPOSITORY) private readonly repo: MfaRepository,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(LOGIN_EVENTS) private readonly events: LoginEvents,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  /** Сейчас — отдельным методом, чтобы тесты могли подменять часы. */
  protected now(): number {
    return Date.now();
  }

  async status(user: AuthUser): Promise<MfaStatusDto> {
    const [totp, left] = await Promise.all([
      this.repo.getTotp(user.id),
      this.repo.countRecoveryCodes(user.id),
    ]);
    return {
      totp: { enabled: !!totp?.confirmedAt, confirmedAt: totp?.confirmedAt?.toISOString() ?? null },
      recoveryCodesLeft: left,
    };
  }

  /** Новый секрет. Уже включённый фактор перевыпустить нельзя: сначала его нужно отключить. */
  async setup(user: AuthUser): Promise<TotpSetupDto> {
    const secret = generateTotpSecret();
    if (!(await this.repo.savePending(user.id, this.box.seal('totp', user.id, secret))))
      throw new ConflictError('приложение-аутентификатор уже включено — сначала отключите его');
    return { secret: base32Encode(secret), otpauthUri: otpauthUri(ISSUER, user.login, secret) };
  }

  async confirm(user: AuthUser, code: string): Promise<{ enabled: true; recoveryCodes: string[] }> {
    const row = await this.repo.getTotp(user.id);
    if (!row) throw new ValidationError('сначала получите секрет: POST /mfa/totp/setup', 'code');
    if (row.confirmedAt) throw new ConflictError('приложение-аутентификатор уже включено');
    const counter = await this.checkCode(user, row, code);
    await this.repo.confirmTotp(user.id, counter);
    // Включение всегда выпускает новый набор: прежние коды (если остались) аннулируются.
    const codes = await this.issueRecoveryCodes(user);
    // Сотрудник без других факторов получает полный доступ в этой сессии: TOTP заменяет passkey.
    if (user.role !== 'subject' && !user.mfaComplete) await this.sessions.completeMfa(user.sessionId, 'otp');
    await this.audit.record({ actorId: user.id, action: 'totp.enabled', target: user.id });
    return { enabled: true, recoveryCodes: codes };
  }

  /** Второй фактор входа сотрудника: код из приложения. */
  async verifyLogin(user: AuthUser, code: string): Promise<{ mfaComplete: true }> {
    const row = await this.repo.getTotp(user.id);
    if (!row?.confirmedAt) throw new ValidationError('приложение-аутентификатор не включено', 'code');
    await this.checkCode(user, row, code, true);
    await this.sessions.completeMfa(user.sessionId, 'otp');
    await this.events.record({ userId: user.id, success: true, method: 'totp', amr: ['pwd', 'otp', 'mfa'] });
    await this.audit.record({
      actorId: user.id,
      action: 'staff.login',
      target: user.id,
      details: { factor: 'totp' },
    });
    return { mfaComplete: true };
  }

  /** Вход по коду восстановления: код гасится, сессия получает полный доступ. */
  async verifyRecovery(
    user: AuthUser,
    input: string,
  ): Promise<{ mfaComplete: true; recoveryCodesLeft: number }> {
    const row = await this.repo.getTotp(user.id);
    if (!row?.confirmedAt) throw new ValidationError('коды восстановления не выпущены', 'code');
    this.assertNotLocked(row);
    const hash = await this.hashRecovery(user.id, input);
    if (!(await this.repo.consumeRecoveryCode(user.id, hash))) {
      await this.fail(user, 'recovery', 'RECOVERY_CODE_INVALID');
    }
    await this.sessions.completeMfa(user.sessionId, 'otp');
    const left = await this.repo.countRecoveryCodes(user.id);
    await this.events.record({
      userId: user.id,
      success: true,
      method: 'recovery',
      amr: ['pwd', 'otp', 'mfa'],
    });
    await this.audit.record({
      actorId: user.id,
      action: 'recovery.used',
      target: user.id,
      details: { left },
    });
    return { mfaComplete: true, recoveryCodesLeft: left };
  }

  /** Новый набор кодов; старые аннулируются. Нужен действующий код из приложения. */
  async regenerate(user: AuthUser, code: string): Promise<{ recoveryCodes: string[] }> {
    const row = await this.repo.getTotp(user.id);
    if (!row?.confirmedAt) throw new ValidationError('сначала включите приложение-аутентификатор', 'code');
    await this.checkCode(user, row, code);
    return { recoveryCodes: await this.issueRecoveryCodes(user) };
  }

  /** Отключение: нужен действующий код. Коды восстановления удаляются вместе с фактором. */
  async disable(user: AuthUser, code: string): Promise<void> {
    const row = await this.repo.getTotp(user.id);
    if (!row?.confirmedAt) throw new ValidationError('приложение-аутентификатор не включено', 'code');
    await this.checkCode(user, row, code);
    await this.repo.deleteTotp(user.id);
    await this.audit.record({ actorId: user.id, action: 'totp.disabled', target: user.id });
  }

  // ── внутреннее ──

  private assertNotLocked(row: TotpRow): void {
    if (row.lockedUntil && row.lockedUntil.getTime() > this.now())
      throw new TooManyAttemptsError(
        'слишком много неверных кодов — подождите несколько минут',
        row.lockedUntil,
      );
  }

  /** Проверяет код, принимает шаг времени (защита от повтора) и возвращает его; иначе — отказ со счётчиком. */
  private async checkCode(user: AuthUser, row: TotpRow, code: string, record = false): Promise<number> {
    this.assertNotLocked(row);
    const secret = this.box.open('totp', user.id, row.sealed);
    const counter = verifyTotp(secret, code, this.now(), row.lastCounter);
    if (counter === null || (row.confirmedAt && !(await this.repo.acceptCounter(user.id, counter)))) {
      await this.fail(user, 'totp', 'TOTP_INVALID', record);
    }
    return counter ?? totpCounter(this.now());
  }

  private async fail(
    user: AuthUser,
    method: 'totp' | 'recovery',
    reason: string,
    record = true,
  ): Promise<never> {
    const r = await this.repo.registerFailure(user.id, MAX_FAILURES, new Date(this.now() + LOCK_MS));
    if (record) await this.events.record({ userId: user.id, success: false, method, amr: ['pwd'], reason });
    if (r.lockedUntil) {
      await this.audit.record({
        actorId: user.id,
        action: 'user.locked',
        target: user.id,
        details: { factor: method },
      });
      throw new TooManyAttemptsError(
        'слишком много неверных кодов — подождите несколько минут',
        r.lockedUntil,
      );
    }
    throw new UnauthorizedError('неверный код', 'Код не подошёл');
  }

  private async issueRecoveryCodes(user: AuthUser): Promise<string[]> {
    const codes = Array.from({ length: RECOVERY_CODES }, generateRecoveryCode);
    const hashes = await Promise.all(codes.map((c) => this.hashRecovery(user.id, c)));
    await this.repo.replaceRecoveryCodes(user.id, hashes);
    await this.audit.record({
      actorId: user.id,
      action: 'recovery.generated',
      target: user.id,
      details: { count: codes.length },
    });
    return codes;
  }

  /** scrypt с «солью» из id пользователя: детерминированный хэш для поиска и дорогой перебор при утечке БД. */
  private async hashRecovery(userId: string, code: string): Promise<string> {
    return (await scrypt(normalizeRecoveryCode(code), `rcv|${userId}`, 32)).toString('hex');
  }
}
