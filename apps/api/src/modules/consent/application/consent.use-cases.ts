import type { ConsentTextDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { ConflictError, ForbiddenError, ValidationError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { BIOMETRIC_ERASER, type BiometricEraser } from '../../biometrics/application/ports';
import { CONSENT_TEXTS, CURRENT_CONSENT_VERSION } from './consent-texts';

export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');
export const CONSENT_CHECKER = Symbol('CONSENT_CHECKER');

export interface ConsentRepository {
  /** false — действующее согласие уже есть. */
  grant(userId: string, textVersion: string): Promise<boolean>;
  revoke(userId: string): Promise<boolean>;
  active(userId: string): Promise<{ textVersion: string } | null>;
}

/** Узкий порт: модули захвата биометрии проверяют согласие до любой обработки кадров. */
export interface ConsentChecker {
  require(userId: string): Promise<void>;
}

@Injectable()
export class ConsentService implements ConsentChecker {
  constructor(
    @Inject(CONSENT_REPOSITORY) private readonly repo: ConsentRepository,
    @Inject(BIOMETRIC_ERASER) private readonly eraser: BiometricEraser,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  currentText(): ConsentTextDto {
    return CONSENT_TEXTS[CURRENT_CONSENT_VERSION]!;
  }

  async grant(userId: string, textVersion: string): Promise<void> {
    if (textVersion !== CURRENT_CONSENT_VERSION) {
      throw new ValidationError(
        `текст согласия устарел: актуальная версия ${CURRENT_CONSENT_VERSION}`,
        'textVersion',
      );
    }
    if (!(await this.repo.grant(userId, textVersion))) throw new ConflictError('согласие уже дано');
    await this.audit.record({
      actorId: userId,
      action: 'consent.granted',
      target: userId,
      details: { textVersion },
    });
  }

  /** Отзыв согласия удаляет биометрию (UC-5) и обезличивает статистику — одной транзакцией в хранилище. */
  async revoke(userId: string) {
    const revoked = await this.repo.revoke(userId);
    const erased = await this.eraser.erase(userId);
    if (revoked) {
      await this.audit.record({
        actorId: userId,
        action: 'consent.revoked',
        target: userId,
        details: erased,
      });
    }
    if (erased.face) await this.audit.record({ actorId: userId, action: 'face.deleted', target: userId });
    return { revoked, ...erased };
  }

  async require(userId: string): Promise<void> {
    if (!(await this.repo.active(userId))) {
      throw new ForbiddenError('нужно согласие на обработку биометрических данных', 'consent-required');
    }
  }
}
