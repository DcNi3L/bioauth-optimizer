import type { ColumnType, Generated } from 'kysely';

/** Типы таблиц для Kysely; источник правды — SQL-миграции в apps/api/migrations. */
export interface FactorCatalogTable {
  id: Generated<string>;
  name: string;
  description: string | null;
  is_preset: Generated<boolean>;
  created_at: ColumnType<Date, never, never>;
  updated_at: ColumnType<Date, never, Date>;
}

export interface FactorTable {
  id: Generated<string>;
  catalog_id: string;
  code: string;
  name: string;
  far: number;
  frr: number;
  latency_ms: number;
  cost: number;
  has_pad: boolean;
  position: number;
}

export interface ScoreDatasetTable {
  id: Generated<string>;
  name: string;
  original_filename: string;
  genuine_count: number;
  impostor_count: number;
  genuine_scores: Buffer;
  impostor_scores: Buffer;
  sha256: string;
  created_at: ColumnType<Date, never, never>;
}

export type ExperimentTypeDb = 'THRESHOLD' | 'FACTOR_SELECTION' | 'BUDGET_SWEEP';
export type ExperimentStatusDb = 'OK' | 'INFEASIBLE';

export interface ExperimentTable {
  id: Generated<string>;
  type: ExperimentTypeDb;
  status: ExperimentStatusDb;
  input: ColumnType<unknown, string, never>;
  result: ColumnType<unknown, string, never>;
  input_hash: string;
  solver: string | null;
  core_version: string;
  duration_ms: number;
  factor_catalog_id: string | null;
  score_dataset_id: string | null;
  created_at: ColumnType<Date, never, never>;
}

export interface Database {
  factor_catalog: FactorCatalogTable;
  factor: FactorTable;
  score_dataset: ScoreDatasetTable;
  experiment: ExperimentTable;
}
