import type { AttackType, FaceStep, PadReportDto, PadSampleRequest } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { UnprocessableError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  FACE_ENGINE,
  type FaceEngine,
  FaceRejectedError,
  SCORE_SAMPLES,
  type ScoreSampleRepository,
} from '../../biometrics/application/ports';
import { POLICY_READER, type PolicyReader } from '../../policy/application/ports';
import { CALIBRATION_QUERY, type CalibrationQuery } from './ports';
import { wilson } from './stats';

const ATTACK_TYPES: readonly AttackType[] = ['print', 'screen', 'video', 'mask', 'other'];

/**
 * Испытание защиты от атак на предъявление (UC-8, ISO/IEC 30107-3). Оператор снимает подлинные
 * предъявления и атаки (фото, экран, видео); p_live каждой записи — оценка для калибровки τ_pad.
 * APCER — доля атак, принятых за живое лицо; BPCER — доля подлинных, отвергнутых как атака.
 */
@Injectable()
export class PadTestService {
  constructor(
    @Inject(FACE_ENGINE) private readonly engine: FaceEngine,
    @Inject(SCORE_SAMPLES) private readonly samples: ScoreSampleRepository,
    @Inject(CALIBRATION_QUERY) private readonly query: CalibrationQuery,
    @Inject(POLICY_READER) private readonly policies: PolicyReader,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  private async tauPad(): Promise<number> {
    const face = (await this.policies.active()).steps.find((s): s is FaceStep => s.factor === 'face');
    return face?.tauPad ?? 0.5;
  }

  async record(user: AuthUser, req: PadSampleRequest) {
    let r;
    try {
      r = await this.engine.liveness({ baseline: req.frames, steps: [] });
    } catch (err) {
      if (err instanceof FaceRejectedError)
        throw new UnprocessableError(err.message, 'FACE_QUALITY', { frames: err.frames });
      throw err;
    }
    const attackType = req.label.kind === 'attack' ? req.label.attackType : null;
    await this.samples.add([
      {
        modality: 'pad',
        kind: req.label.kind,
        score: r.pLiveMedian,
        modelVersion: r.padVersion,
        source: 'pad_test',
        attackType,
      },
    ]);
    await this.audit.record({
      actorId: user.id,
      action: 'pad_test.recorded',
      details: { kind: req.label.kind, attackType, padVersion: r.padVersion },
    });
    const tau = await this.tauPad();
    return { pLive: r.pLiveMedian, padVersion: r.padVersion, detectedAsLive: r.pLiveMedian >= tau };
  }

  async report(padVersion: string | null, threshold: number | null): Promise<PadReportDto> {
    const tau = threshold ?? (await this.tauPad());
    const { version, versions, rows } = await this.query.padScores(padVersion);
    const bona = rows.filter((r) => r.kind === 'bonafide');
    const rejected = bona.filter((r) => r.score < tau).length;
    const rate = (k: number, n: number) => ({
      errors: k,
      total: n,
      rate: n ? k / n : null,
      interval: n ? wilson(k, n) : null,
    });
    const apcer = ATTACK_TYPES.map((t) => {
      const attacks = rows.filter((r) => r.kind === 'attack' && r.attackType === t);
      return { attackType: t, ...rate(attacks.filter((r) => r.score >= tau).length, attacks.length) };
    }).filter((a) => a.total > 0);
    const rates = apcer.map((a) => a.rate).filter((x): x is number => x !== null);
    return {
      padVersion: version,
      threshold: tau,
      bpcer: rate(rejected, bona.length),
      apcer,
      apcerMax: rates.length ? Math.max(...rates) : null,
      versions,
    };
  }
}
