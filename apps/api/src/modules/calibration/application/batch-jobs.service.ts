import { randomUUID } from 'node:crypto';

import type { BatchJobDto, BioBatchResponse } from '@bioauth/contracts';
import { Inject, Injectable, Logger } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import {
  ConflictError,
  NotFoundError,
  ServiceUnavailableError,
  UnprocessableError,
  ValidationError,
} from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import {
  FACE_ENGINE,
  type FaceEngine,
  SCORE_SAMPLES,
  type ScoreSampleRepository,
} from '../../biometrics/application/ports';
import { UploadScoreDatasetUseCase } from '../../score-datasets/application/score-dataset.use-cases';

export interface StartBatchCommand {
  readonly archive: Buffer;
  readonly filename: string;
  readonly name?: string;
  readonly seed: number;
  readonly maxImpostor: number;
  readonly includeInCalibration: boolean;
}

interface Job {
  dto: BatchJobDto;
  csv: Buffer | null;
  readonly abort: AbortController;
}

const KEEP_FINISHED = 20;

/** CSV score,label — формат загрузки наборов оценок v1 (модуль score-datasets не меняется). */
export function scoresCsv(r: Pick<BioBatchResponse, 'genuine' | 'impostor'>): Buffer {
  const lines = ['score,label'];
  for (const s of r.genuine) lines.push(`${s},genuine`);
  for (const s of r.impostor) lines.push(`${s},impostor`);
  return Buffer.from(`${lines.join('\n')}\n`, 'utf8');
}

/**
 * Пакетный режим (UC-9, docs/10 §10.6 способ B): архив изображений → оценки bio-engine → CSV → набор
 * оценок для расчёта порога v1; по желанию оценки добавляются и в калибровку (источник batch).
 * Задача выполняется в процессе API, одна за раз; состояние живёт в памяти до перезапуска —
 * результат при этом сохранён в БД как набор оценок, а CSV воспроизводится тем же seed.
 */
@Injectable()
export class BatchJobsService {
  private readonly logger = new Logger('BatchJobs');
  private readonly jobs = new Map<string, Job>();

  constructor(
    @Inject(FACE_ENGINE) private readonly engine: FaceEngine,
    @Inject(SCORE_SAMPLES) private readonly samples: ScoreSampleRepository,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
    private readonly upload: UploadScoreDatasetUseCase,
  ) {}

  start(user: AuthUser, cmd: StartBatchCommand): BatchJobDto {
    if ([...this.jobs.values()].some((j) => j.dto.state === 'running'))
      throw new ConflictError('уже выполняется пакетная задача — дождитесь её или отмените');
    const stem = cmd.filename.replace(/\.[^.]+$/, '').slice(0, 200);
    const given = cmd.name?.trim() ?? '';
    const job: Job = {
      abort: new AbortController(),
      csv: null,
      dto: {
        id: randomUUID(),
        state: 'running',
        stage: 'scoring',
        filename: cmd.filename.slice(0, 255),
        name: given.length > 0 ? given : stem.length > 0 ? stem : 'batch',
        seed: cmd.seed,
        maxImpostor: cmd.maxImpostor,
        includeInCalibration: cmd.includeInCalibration,
        startedAt: new Date().toISOString(),
        finishedAt: null,
        error: null,
        result: null,
      },
    };
    this.jobs.set(job.dto.id, job);
    this.prune();
    void this.run(user, job, cmd);
    return job.dto;
  }

  list(): BatchJobDto[] {
    return [...this.jobs.values()].map((j) => j.dto).reverse();
  }

  get(id: string): BatchJobDto {
    return this.find(id).dto;
  }

  csv(id: string): { filename: string; content: Buffer } {
    const job = this.find(id);
    if (!job.csv) throw new NotFoundError('CSV готов только у завершённой задачи');
    return { filename: `${job.dto.name}.csv`, content: job.csv };
  }

  cancel(id: string): void {
    const job = this.find(id);
    if (job.dto.state !== 'running') throw new ConflictError('задача уже завершена');
    job.abort.abort();
    this.finish(job, { state: 'cancelled', error: 'отменена пользователем' });
  }

  private find(id: string): Job {
    const job = this.jobs.get(id);
    if (!job)
      throw new NotFoundError('пакетная задача не найдена (после перезапуска сервера список очищается)');
    return job;
  }

  private finish(job: Job, patch: Partial<BatchJobDto>): void {
    job.dto = { ...job.dto, stage: null, finishedAt: new Date().toISOString(), ...patch };
  }

  private prune(): void {
    const finished = [...this.jobs.values()].filter((j) => j.dto.state !== 'running');
    for (const j of finished.slice(0, Math.max(0, finished.length - KEEP_FINISHED)))
      this.jobs.delete(j.dto.id);
  }

  private async run(user: AuthUser, job: Job, cmd: StartBatchCommand): Promise<void> {
    try {
      const r = await this.engine.batchFace(
        cmd.archive,
        { seed: cmd.seed, maxImpostor: cmd.maxImpostor },
        job.abort.signal,
      );
      if (job.dto.state !== 'running') return;
      job.dto = { ...job.dto, stage: 'saving' };
      const csv = scoresCsv(r);
      const dataset = await this.upload.execute({
        originalFilename: `${job.dto.name}.csv`,
        content: csv,
        name: job.dto.name,
      });
      if (cmd.includeInCalibration) {
        await this.samples.add([
          ...r.genuine.map((score) => ({
            modality: 'face' as const,
            kind: 'genuine' as const,
            score,
            modelVersion: r.modelVersion,
            source: 'batch' as const,
          })),
          ...r.impostor.map((score) => ({
            modality: 'face' as const,
            kind: 'impostor' as const,
            score,
            modelVersion: r.modelVersion,
            source: 'batch' as const,
          })),
        ]);
      }
      await this.audit.record({
        actorId: user.id,
        action: 'batch.scored',
        target: dataset.id,
        details: {
          filename: job.dto.filename,
          modelVersion: r.modelVersion,
          genuine: r.genuine.length,
          impostor: r.impostor.length,
          seed: cmd.seed,
          includeInCalibration: cmd.includeInCalibration,
        },
      });
      job.csv = csv;
      this.finish(job, {
        state: 'done',
        result: {
          datasetId: dataset.id,
          modelVersion: r.modelVersion,
          subjects: r.subjects,
          images: r.images,
          imagesUsed: r.imagesUsed,
          skipped: r.skipped,
          skippedTotal: r.skippedTotal,
          genuineCount: r.genuine.length,
          impostorCount: r.impostor.length,
          impostorTotal: r.protocol.impostorTotal,
          impostorSampled: r.protocol.impostorSampled,
        },
      });
    } catch (err) {
      if (job.dto.state !== 'running') return;
      const expected =
        err instanceof UnprocessableError ||
        err instanceof ServiceUnavailableError ||
        err instanceof ValidationError;
      if (!expected) this.logger.error({ err }, 'пакетная задача завершилась ошибкой');
      this.finish(job, { state: 'failed', error: expected ? err.message : 'внутренняя ошибка сервера' });
    }
  }
}
