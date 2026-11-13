import type { ConsentTextDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { ConflictError, ForbiddenError, ValidationError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { BIOMETRIC_ERASER, type BiometricEraser } from '../../biometrics/application/ports';
import { CONSENT_SCOPES, CONSENT_TEXTS, type ConsentScope, CURRENT_CONSENT_VERSION } from './consent-texts';

export const CONSENT_REPOSITORY = Symbol('CONSENT_REPOSITORY');
export const CONSENT_CHECKER = Symbol('CONSENT_CHECKER');

export interface ConsentRepository {
  /** false — действующее согласие уже есть. */
  grant(userId: string, textVersion: string): Promise<boolean>;
  /** Заменяет действующее согласие редакции `from` новой редакцией (без удаления биометрии); false — состояние изменилось. */
  supersede(userId: string, from: string, to: string): Promise<boolean>;
  revoke(userId: string): Promise<boolean>;
  active(userId: string): Promise<{ textVersion: string } | null>;
}

/** Узкий порт: модули захвата биометрии проверяют согласие до любой обработки кадров. */
export interface ConsentChecker {
  /** scope — вид данных; согласие старой редакции, не покрывающее его, — 403 consent-outdated. */
  require(userId: string, scope?: ConsentScope): Promise<void>;
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
    const current = await this.repo.active(userId);
    let supersedes: string | undefined;
    if (current && current.textVersion !== textVersion) {
      if (!(await this.repo.supersede(userId, current.textVersion, textVersion))) {
        throw new ConflictError('согласие изменилось, обновите страницу');
      }
      supersedes = current.textVersion;
    } else if (!(await this.repo.grant(userId, textVersion))) {
      throw new ConflictError('согласие уже дано');
    }
    await this.audit.record({
      actorId: userId,
      action: 'consent.granted',
      target: userId,
      details: supersedes ? { textVersion, supersedes } : { textVersion },
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

  async require(userId: string, scope: ConsentScope = 'face'): Promise<void> {
    const active = await this.repo.active(userId);
    if (!active) {
      throw new ForbiddenError('нужно согласие на обработку биометрических данных', 'consent-required');
    }
    if (!(CONSENT_SCOPES[active.textVersion] ?? []).includes(scope)) {
      throw new ForbiddenError(
        `согласие редакции ${active.textVersion} не покрывает этот вид данных: примите редакцию ${CURRENT_CONSENT_VERSION}`,
        'consent-outdated',
      );
    }
  }
}
