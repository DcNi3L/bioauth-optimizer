import { HISTOGRAM_BINS, type ScoreDatasetDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { sha256Hex } from '../../../shared/canonical-json';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import {
  SCORE_DATASET_REPOSITORY,
  SCORE_FILE_PARSER,
  type ScoreDatasetRecord,
  type ScoreDatasetRepository,
  type ScoreFileParser,
} from './ports';

export interface UploadScoreFileCommand {
  readonly originalFilename: string;
  readonly content: Buffer;
  readonly name?: string;
}

export function describeDataset(d: ScoreDatasetRecord): ScoreDatasetDto {
  let min = Infinity;
  let max = -Infinity;
  for (const arr of [d.genuine, d.impostor]) {
    for (const v of arr) {
      if (v < min) min = v;
      if (v > max) max = v;
    }
  }
  const width = max > min ? (max - min) / HISTOGRAM_BINS : 1;
  const edges = Array.from({ length: HISTOGRAM_BINS + 1 }, (_, k) => min + k * width);
  const bin = (v: number) => Math.min(HISTOGRAM_BINS - 1, Math.floor((v - min) / width));
  const genuine = new Array<number>(HISTOGRAM_BINS).fill(0);
  const impostor = new Array<number>(HISTOGRAM_BINS).fill(0);
  for (const v of d.genuine) genuine[bin(v)]!++;
  for (const v of d.impostor) impostor[bin(v)]!++;
  return {
    id: d.id,
    name: d.name,
    originalFilename: d.originalFilename,
    genuineCount: d.genuine.length,
    impostorCount: d.impostor.length,
    min,
    max,
    histogram: { edges, genuine, impostor },
    createdAt: d.createdAt.toISOString(),
  };
}

@Injectable()
export class UploadScoreDatasetUseCase {
  constructor(
    @Inject(SCORE_FILE_PARSER) private readonly parser: ScoreFileParser,
    @Inject(SCORE_DATASET_REPOSITORY) private readonly repository: ScoreDatasetRepository,
  ) {}

  async execute(cmd: UploadScoreFileCommand): Promise<ScoreDatasetDto> {
    if (cmd.content.length === 0) throw new ValidationError('файл пустой', 'file');
    const samples = this.parser.parse(cmd.content);
    const filename = cmd.originalFilename.slice(0, 255) || 'scores.csv';
    const given = cmd.name?.trim() ?? '';
    const name = (given.length > 0 ? given : filename.replace(/\.[^.]+$/, '')).slice(0, 200);
    const id = await this.repository.saveIfAbsent({
      ...samples,
      name,
      originalFilename: filename,
      sha256: sha256Hex(cmd.content),
    });
    const saved = await this.repository.findById(id);
    if (!saved) throw new NotFoundError(`набор оценок ${id} не найден`);
    return describeDataset(saved);
  }
}

@Injectable()
export class GetScoreDatasetUseCase {
  constructor(@Inject(SCORE_DATASET_REPOSITORY) private readonly repository: ScoreDatasetRepository) {}

  async execute(id: string): Promise<ScoreDatasetDto> {
    const d = await this.repository.findById(id);
    if (!d) throw new NotFoundError(`набор оценок ${id} не найден`);
    return describeDataset(d);
  }
}
