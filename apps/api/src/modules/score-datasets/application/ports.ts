export const SCORE_DATASET_REPOSITORY = Symbol('SCORE_DATASET_REPOSITORY');
export const SCORE_SAMPLES_READER = Symbol('SCORE_SAMPLES_READER');
export const SCORE_FILE_PARSER = Symbol('SCORE_FILE_PARSER');

export interface ScoreSamples {
  readonly genuine: Float64Array;
  readonly impostor: Float64Array;
}

export interface ScoreDatasetRecord extends ScoreSamples {
  readonly id: string;
  readonly name: string;
  readonly originalFilename: string;
  readonly sha256: string;
  readonly createdAt: Date;
}

export interface NewScoreDataset extends ScoreSamples {
  readonly name: string;
  readonly originalFilename: string;
  readonly sha256: string;
}

export interface ScoreDatasetRepository {
  /** Идемпотентно: при совпадении sha256 возвращает существующую запись. */
  saveIfAbsent(dataset: NewScoreDataset): Promise<string>;
  findById(id: string): Promise<ScoreDatasetRecord | null>;
}

/** Узкий порт чтения оценок для модуля «Порог» (ISP). */
export interface ScoreSamplesReader {
  findSamples(id: string): Promise<ScoreSamples | null>;
}

export interface ScoreFileParser {
  parse(content: Buffer): ScoreSamples;
}
