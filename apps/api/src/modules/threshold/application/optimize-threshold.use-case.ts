import { Inject, Injectable, Logger } from '@nestjs/common';
import { CORE_VERSION, optimizeThreshold, type ThresholdModelInput } from '@bioauth/optimization-core';
import type { ThresholdOptimizeCommand, ThresholdOptimizeResponse } from '@bioauth/contracts';
import { InternalConsistencyError, NotFoundError } from '../../../shared/errors';
import { ExperimentRecorder } from '../../experiments/application/experiment-recorder';
import { SCORE_SAMPLES_READER, type ScoreSamplesReader } from '../../score-datasets/application/ports';

/** Сценарий «Оптимальный порог»: вход → ядро → сохранение эксперимента → ответ. */
@Injectable()
export class OptimizeThresholdUseCase {
  private readonly logger = new Logger(OptimizeThresholdUseCase.name);

  constructor(
    @Inject(SCORE_SAMPLES_READER) private readonly samples: ScoreSamplesReader,
    private readonly recorder: ExperimentRecorder,
  ) {}

  async execute(cmd: ThresholdOptimizeCommand): Promise<ThresholdOptimizeResponse> {
    const started = performance.now();
    let model: ThresholdModelInput;
    let datasetId: string | null = null;
    if (cmd.model.kind === 'gaussian') {
      model = { kind: 'gaussian', genuine: cmd.model.genuine, impostor: cmd.model.impostor };
    } else {
      datasetId = cmd.model.datasetId;
      const samples = await this.samples.findSamples(datasetId);
      if (!samples) throw new NotFoundError(`набор оценок ${datasetId} не найден`);
      model = { kind: 'empirical', genuine: samples.genuine, impostor: samples.impostor };
    }

    const { result, curves } = optimizeThreshold({
      model,
      costs: cmd.costs,
      farMax: cmd.constraints.farMax,
      curve: cmd.curve,
    });
    if (result.verification.status === 'mismatch') {
      this.logger.error({ input: cmd, verification: result.verification }, 'верификация порога не сошлась');
      throw new InternalConsistencyError('численная проверка не подтвердила аналитический оптимум');
    }
    const durationMs = performance.now() - started;
    const experimentId = await this.recorder.record({
      type: 'THRESHOLD',
      status: 'OK',
      input: cmd,
      result,
      solver: result.method,
      durationMs,
      scoreDatasetId: datasetId,
    });
    return { experimentId, ...result, curves, meta: { coreVersion: CORE_VERSION, durationMs: Math.round(durationMs) } } as ThresholdOptimizeResponse;
  }
}
