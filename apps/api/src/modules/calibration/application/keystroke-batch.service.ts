import { KEYSTROKE_ENROLL_SAMPLES, type ScoreDatasetDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { UnprocessableError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { SCORE_SAMPLES, type ScoreSampleRepository } from '../../biometrics/application/ports';
import { buildTemplate, distance, KEYSTROKE_MODEL, scoreOf } from '../../keystroke/domain/keystroke';
import { UploadScoreDatasetUseCase } from '../../score-datasets/application/score-dataset.use-cases';
import { scoresCsv } from './batch-jobs.service';

export interface TypingSubjectInput {
  readonly id: string;
  /** Векторы признаков ввода [H…, DD…] в мс, в порядке записи (сеанс, повтор). */
  readonly vectors: readonly (readonly number[])[];
}

export interface KeystrokeProtocol {
  /** Повторов на шаблон — как при регистрации ритма в BioAuth. */
  readonly enroll: number;
  /** Genuine-пробы: каждый stride-й ввод после регистрации (охватывает все сеансы). */
  readonly stride: number;
  /** Impostor-пробы: первые N вводов каждого другого человека (протокол Killourhy & Maxion, 2009). */
  readonly impostorPerSubject: number;
}

export const DEFAULT_KEYSTROKE_PROTOCOL: KeystrokeProtocol = {
  enroll: KEYSTROKE_ENROLL_SAMPLES,
  stride: 8,
  impostorPerSubject: 5,
};

/**
 * Оценки ритма набора по протоколу пар: шаблон каждого человека строится тем же детектором, что и при
 * входе (масштабированное манхэттенское расстояние), genuine — его последующие вводы, impostor — вводы
 * других людей. Оценка — 1 − d/4, как у входа по ритму.
 */
export function keystrokeScores(
  subjects: readonly TypingSubjectInput[],
  p: KeystrokeProtocol = DEFAULT_KEYSTROKE_PROTOCOL,
): { genuine: number[]; impostor: number[]; subjects: number } {
  const usable = subjects.filter((s) => s.vectors.length >= p.enroll + 1);
  if (usable.length < 2) throw new UnprocessableError('нужно не менее двух человек с повторами', 'NO_PAIRS');
  const dim = usable[0]!.vectors[0]!.length;
  if (usable.some((s) => s.vectors.some((v) => v.length !== dim)))
    throw new UnprocessableError('у всех вводов должно быть одинаковое число признаков', 'DIMENSION');
  const genuine: number[] = [];
  const impostor: number[] = [];
  const round = (x: number) => Math.round(x * 1e6) / 1e6;
  for (const s of usable) {
    const template = buildTemplate(s.vectors.slice(0, p.enroll));
    for (let i = p.enroll; i < s.vectors.length; i += p.stride)
      genuine.push(round(scoreOf(distance(template, s.vectors[i]!))));
    for (const o of usable) {
      if (o === s) continue;
      for (const v of o.vectors.slice(0, p.impostorPerSubject))
        impostor.push(round(scoreOf(distance(template, v))));
    }
  }
  return { genuine, impostor, subjects: usable.length };
}

/** Пакетный режим для ритма набора (аналог UC-9 для лица): набор оценок и, по желанию, оценки калибровки. */
@Injectable()
export class KeystrokeBatchService {
  constructor(
    @Inject(SCORE_SAMPLES) private readonly samples: ScoreSampleRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    private readonly upload: UploadScoreDatasetUseCase,
  ) {}

  async score(
    user: AuthUser,
    cmd: {
      name: string;
      subjects: readonly TypingSubjectInput[];
      protocol?: KeystrokeProtocol;
      includeInCalibration: boolean;
    },
  ): Promise<{ dataset: ScoreDatasetDto; genuine: number; impostor: number; subjects: number }> {
    const r = keystrokeScores(cmd.subjects, cmd.protocol);
    const dataset = await this.upload.execute({
      originalFilename: `${cmd.name}.csv`,
      content: scoresCsv(r),
      name: cmd.name,
    });
    if (cmd.includeInCalibration) {
      await this.samples.add([
        ...r.genuine.map((score) => ({
          modality: 'keystroke' as const,
          kind: 'genuine' as const,
          score,
          modelVersion: KEYSTROKE_MODEL,
          source: 'batch' as const,
        })),
        ...r.impostor.map((score) => ({
          modality: 'keystroke' as const,
          kind: 'impostor' as const,
          score,
          modelVersion: KEYSTROKE_MODEL,
          source: 'batch' as const,
        })),
      ]);
    }
    await this.audit.record({
      actorId: user.id,
      action: 'batch.scored',
      target: dataset.id,
      details: {
        modality: 'keystroke',
        modelVersion: KEYSTROKE_MODEL,
        subjects: r.subjects,
        genuine: r.genuine.length,
        impostor: r.impostor.length,
        includeInCalibration: cmd.includeInCalibration,
      },
    });
    return { dataset, genuine: r.genuine.length, impostor: r.impostor.length, subjects: r.subjects };
  }
}
