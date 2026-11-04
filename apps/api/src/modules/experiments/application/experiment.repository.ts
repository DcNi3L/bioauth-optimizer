import type { ExperimentStatusDb, ExperimentTypeDb } from '../../../shared/database/schema';

export const EXPERIMENT_REPOSITORY = Symbol('EXPERIMENT_REPOSITORY');

export interface NewExperiment {
  readonly type: ExperimentTypeDb;
  readonly status: ExperimentStatusDb;
  readonly input: unknown;
  readonly result: unknown;
  readonly inputHash: string;
  readonly solver: string | null;
  readonly coreVersion: string;
  readonly durationMs: number;
  readonly factorCatalogId: string | null;
  readonly scoreDatasetId: string | null;
}

export interface ExperimentRecord extends NewExperiment {
  readonly id: string;
  readonly createdAt: Date;
}

export interface ExperimentPageQuery {
  readonly type?: ExperimentTypeDb;
  readonly limit: number;
  readonly after?: { readonly createdAt: Date; readonly id: string };
}

/** Порт хранилища экспериментов (узкий интерфейс — ISP). */
export interface ExperimentRepository {
  save(experiment: NewExperiment): Promise<{ id: string; createdAt: Date }>;
  findById(id: string): Promise<ExperimentRecord | null>;
  /** Keyset-пагинация по (created_at DESC, id DESC). */
  list(query: ExperimentPageQuery): Promise<ExperimentRecord[]>;
}
