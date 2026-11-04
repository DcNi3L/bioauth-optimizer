import type { AttemptsPageDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { ValidationError } from '../../../shared/errors';
import { CALIBRATION_QUERY, type CalibrationQuery } from './ports';

/** Журнал попыток для админки: keyset-пагинация, агрегаты по факторам; аудитор оценок не видит. */
@Injectable()
export class AttemptsService {
  constructor(@Inject(CALIBRATION_QUERY) private readonly query: CalibrationQuery) {}

  async page(
    user: AuthUser,
    q: {
      factor?: 'face' | 'passkey';
      outcome?: 'accept' | 'reject' | 'error' | 'cancel';
      from?: string;
      to?: string;
      limit: number;
      cursor?: string;
    },
  ): Promise<AttemptsPageDto> {
    let cursor: { at: string; id: string } | null = null;
    if (q.cursor) {
      const [at, id] = Buffer.from(q.cursor, 'base64url').toString().split('|');
      const uuid = /^[0-9a-f-]{36}$/i;
      if (!at || !id || Number.isNaN(Date.parse(at)) || !uuid.test(id))
        throw new ValidationError('некорректный курсор', 'cursor');
      cursor = { at, id };
    }
    const period = { from: q.from ? new Date(q.from) : null, to: q.to ? new Date(q.to) : null };
    const [rows, stats] = await Promise.all([
      this.query.attempts({
        ...period,
        factor: q.factor ?? null,
        outcome: q.outcome ?? null,
        limit: q.limit,
        cursor,
      }),
      this.query.attemptStats(period),
    ]);
    const hide = user.role === 'auditor';
    const page = rows.slice(0, q.limit);
    const last = page[page.length - 1];
    return {
      items: page.map(({ cursorAt: _c, ...r }) => ({
        ...r,
        at: r.at.toISOString(),
        login: hide ? null : r.login,
        score: hide ? null : r.score,
        liveness: hide ? null : r.liveness,
      })),
      stats,
      nextCursor:
        rows.length > q.limit && last
          ? Buffer.from(`${last.cursorAt}|${last.id}`).toString('base64url')
          : null,
    };
  }
}
