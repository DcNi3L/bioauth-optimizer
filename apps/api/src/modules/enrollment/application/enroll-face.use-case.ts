import type { CaptureFrame } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { UnprocessableError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  FACE_ENGINE,
  FACE_TEMPLATES,
  type FaceEngine,
  FaceRejectedError,
  type FaceTemplateRepository,
  SCORE_SAMPLES,
  type ScoreSampleRepository,
  TEMPLATE_CIPHER,
  type TemplateCipher,
} from '../../biometrics/application/ports';
import { CONSENT_CHECKER, type ConsentChecker } from '../../consent/application/consent.use-cases';
import { POLICY_READER, type PolicyReader } from '../../policy/application/ports';

export interface EnrollResult {
  readonly enrolled: true;
  readonly framesUsed: number;
  readonly modelVersion: string;
  readonly livenessPassed: boolean;
}

/**
 * Регистрация лица (UC-2): согласие → шаблон по годным кадрам → пассивная PAD → шифрование и сохранение.
 * Пары кадров регистрации дают genuine-оценки для калибровки. Кадры нигде не сохраняются.
 */
@Injectable()
export class EnrollFaceUseCase {
  constructor(
    @Inject(CONSENT_CHECKER) private readonly consent: ConsentChecker,
    @Inject(FACE_ENGINE) private readonly engine: FaceEngine,
    @Inject(TEMPLATE_CIPHER) private readonly cipher: TemplateCipher,
    @Inject(FACE_TEMPLATES) private readonly templates: FaceTemplateRepository,
    @Inject(SCORE_SAMPLES) private readonly samples: ScoreSampleRepository,
    @Inject(POLICY_READER) private readonly policies: PolicyReader,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async execute(userId: string, frames: readonly CaptureFrame[]): Promise<EnrollResult> {
    await this.consent.require(userId);
    let result;
    try {
      result = await this.engine.template(frames);
    } catch (err) {
      if (err instanceof FaceRejectedError) {
        await this.audit.record({
          actorId: userId,
          action: 'face.enroll_failed',
          target: userId,
          details: { code: err.code, issues: err.frames.map((f) => f.issues) },
        });
        throw new UnprocessableError(err.message, 'FACE_QUALITY', { frames: err.frames });
      }
      throw err;
    }

    const face = (await this.policies.active()).steps.find((s) => s.factor === 'face');
    const tauPad = face?.factor === 'face' ? face.tauPad : 0.5;
    if (result.pLiveMedian < tauPad) {
      await this.audit.record({
        actorId: userId,
        action: 'face.enroll_failed',
        target: userId,
        details: { code: 'LIVENESS_PASSIVE' },
      });
      throw new UnprocessableError(
        'проверка «живости» не пройдена: используйте живое лицо, а не фото или экран',
        'LIVENESS_PASSIVE',
      );
    }

    const encrypted = this.cipher.encrypt(userId, result.modelVersion, result.embedding);
    const { replaced } = await this.templates.upsert({
      userId,
      modelVersion: result.modelVersion,
      samples: result.framesUsed,
      ...encrypted,
    });
    await this.samples.add(
      result.pairScores.map((score) => ({
        userId,
        modality: 'face' as const,
        kind: 'genuine' as const,
        score,
        modelVersion: result.modelVersion,
        source: 'enroll' as const,
      })),
    );
    await this.audit.record({
      actorId: userId,
      action: 'face.enrolled',
      target: userId,
      details: {
        modelVersion: result.modelVersion,
        framesUsed: result.framesUsed,
        replaced,
        keyId: encrypted.keyId,
      },
    });
    return {
      enrolled: true,
      framesUsed: result.framesUsed,
      modelVersion: result.modelVersion,
      livenessPassed: true,
    };
  }
}

@Injectable()
export class DeleteFaceUseCase {
  constructor(
    @Inject(FACE_TEMPLATES) private readonly templates: FaceTemplateRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async execute(userId: string): Promise<{ deleted: boolean }> {
    const deleted = await this.templates.delete(userId);
    if (deleted) await this.audit.record({ actorId: userId, action: 'face.deleted', target: userId });
    return { deleted };
  }
}
