import type { SealedSecret } from '../../../shared/crypto/secret-box';

export const KEYSTROKE_REPOSITORY = Symbol('KEYSTROKE_REPOSITORY');

export interface KeystrokeRow {
  readonly userId: string;
  readonly sealed: SealedSecret;
  readonly samples: number;
  readonly phrase: string;
  readonly lockedUntil: Date | null;
  readonly updatedAt: Date;
}

export interface KeystrokeRepository {
  get(userId: string): Promise<KeystrokeRow | null>;
  /** Создаёт или заменяет шаблон и снимает блокировку. */
  save(userId: string, sealed: SealedSecret, samples: number, phrase: string): Promise<void>;
  delete(userId: string): Promise<boolean>;
  registerFailure(userId: string, threshold: number, lockUntil: Date): Promise<{ lockedUntil: Date | null }>;
  resetFailures(userId: string): Promise<void>;
  /** До `limit` случайных шаблонов других пользователей с той же фразой — для impostor-оценок (#48). */
  sampleOthers(userId: string, phrase: string, limit: number): Promise<KeystrokeRow[]>;
}
