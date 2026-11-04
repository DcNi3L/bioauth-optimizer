import { CORE_VERSION } from '@bioauth/optimization-core';
import { Inject, Injectable } from '@nestjs/common';

import { canonicalJson, sha256Hex } from '../../../shared/canonical-json';
import type { ExperimentStatusDb, ExperimentTypeDb } from '../../../shared/database/schema';
import { EXPERIMENT_REPOSITORY, type ExperimentRepository } from './experiment.repository';

export interface RecordExperimentCommand {
  readonly type: ExperimentTypeDb;
  readonly status: ExperimentStatusDb;
  readonly input: unknown;
  readonly result: unknown;
  readonly solver?: string | null;
  readonly durationMs: number;
  readonly factorCatalogId?: string | null;
  readonly scoreDatasetId?: string | null;
}

/** Единственная ответственность — сохранить неизменяемую запись эксперимента (SRP: расчёт не знает о хранении). */
@Injectable()
export class ExperimentRecorder {
  constructor(@Inject(EXPERIMENT_REPOSITORY) private readonly repository: ExperimentRepository) {}

  async record(cmd: RecordExperimentCommand): Promise<string> {
    const { id } = await this.repository.save({
      type: cmd.type,
      status: cmd.status,
      input: cmd.input,
      result: cmd.result,
      inputHash: sha256Hex(canonicalJson({ type: cmd.type, input: cmd.input })),
      solver: cmd.solver ?? null,
      coreVersion: CORE_VERSION,
      durationMs: Math.max(0, Math.round(cmd.durationMs)),
      factorCatalogId: cmd.factorCatalogId ?? null,
      scoreDatasetId: cmd.scoreDatasetId ?? null,
    });
    return id;
  }
}
