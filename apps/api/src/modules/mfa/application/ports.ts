export const MFA_REPOSITORY = Symbol('MFA_REPOSITORY');
import type { SealedSecret } from '../../../shared/crypto/secret-box';

export interface TotpRow {
  readonly userId: string;
  readonly sealed: SealedSecret;
  readonly confirmedAt: Date | null;
  readonly lastCounter: number;
  readonly lockedUntil: Date | null;
}

export interface MfaRepository {
  getTotp(userId: string): Promise<TotpRow | null>;
  /** Сохраняет неподтверждённый секрет; подтверждённый не затрагивает. false — фактор уже включён. */
  savePending(userId: string, sealed: SealedSecret): Promise<boolean>;
  confirmTotp(userId: string, counter: number): Promise<void>;
  /** Принимает шаг времени только если он новее последнего: защита от повторного использования кода. */
  acceptCounter(userId: string, counter: number): Promise<boolean>;
  registerFailure(
    userId: string,
    threshold: number,
    lockUntil: Date,
  ): Promise<{ failures: number; lockedUntil: Date | null }>;
  deleteTotp(userId: string): Promise<boolean>;

  replaceRecoveryCodes(userId: string, hashes: readonly string[]): Promise<void>;
  /** Гасит код атомарно; false — кода нет или он уже использован. */
  consumeRecoveryCode(userId: string, hash: string): Promise<boolean>;
  countRecoveryCodes(userId: string): Promise<number>;
}
