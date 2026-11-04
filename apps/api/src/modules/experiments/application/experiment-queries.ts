import { Inject, Injectable } from '@nestjs/common';
import type { ExperimentDetailDto, ExperimentListDto, ExperimentListQuery, ExperimentSummaryDto } from '@bioauth/contracts';
import { NotFoundError, ValidationError } from '../../../shared/errors';
import { EXPERIMENT_REPOSITORY, type ExperimentRecord, type ExperimentRepository } from './experiment.repository';
import { experimentHeadline } from './headline';

function toSummary(e: ExperimentRecord): ExperimentSummaryDto {
  return {
    id: e.id,
    type: e.type,
    status: e.status,
    solver: e.solver,
    coreVersion: e.coreVersion,
    durationMs: e.durationMs,
    createdAt: e.createdAt.toISOString(),
    headline: experimentHeadline(e),
  };
}

const encodeCursor = (e: ExperimentRecord) =>
  Buffer.from(JSON.stringify({ t: e.createdAt.toISOString(), id: e.id })).toString('base64url');

function decodeCursor(cursor: string): { createdAt: Date; id: string } {
  try {
    const { t, id } = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8')) as { t: string; id: string };
    const createdAt = new Date(t);
    if (Number.isNaN(createdAt.getTime()) || typeof id !== 'string' || !/^[0-9a-f-]{36}$/i.test(id)) throw new Error();
    return { createdAt, id };
  } catch {
    throw new ValidationError('некорректный курсор пагинации', 'cursor');
  }
}

@Injectable()
export class ListExperimentsUseCase {
  constructor(@Inject(EXPERIMENT_REPOSITORY) private readonly repository: ExperimentRepository) {}

  async execute(query: ExperimentListQuery): Promise<ExperimentListDto> {
    const rows = await this.repository.list({
      type: query.type,
      limit: query.limit + 1,
      after: query.cursor ? decodeCursor(query.cursor) : undefined,
    });
    const page = rows.slice(0, query.limit);
    const last = page[page.length - 1];
    return { items: page.map(toSummary), nextCursor: rows.length > query.limit && last ? encodeCursor(last) : null };
  }
}

@Injectable()
export class GetExperimentUseCase {
  constructor(@Inject(EXPERIMENT_REPOSITORY) private readonly repository: ExperimentRepository) {}

  async execute(id: string): Promise<ExperimentDetailDto> {
    const e = await this.repository.findById(id);
    if (!e) throw new NotFoundError(`эксперимент ${id} не найден`);
    return { ...toSummary(e), input: e.input, result: e.result };
  }
}
