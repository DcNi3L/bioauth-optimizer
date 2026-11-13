import { Controller, Get, Inject, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { Roles } from '../../../shared/auth/auth';
import { ValidationError } from '../../../shared/errors';
import {
  AUDIT_LOG,
  type AuditEventView,
  type AuditLog,
  type ChainVerification,
} from '../application/audit-log';

const CSV_COLUMNS = ['seq', 'at', 'actorId', 'action', 'target', 'details', 'hash'] as const;

/** Защита от CSV-инъекции: ячейка, начинающаяся с = + - @, открывается в Excel как формула. */
export function csvCell(value: unknown): string {
  let s: string;
  if (value === null || value === undefined) s = '';
  else if (typeof value === 'string') s = value;
  else s = JSON.stringify(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function toCsv(events: readonly AuditEventView[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const e of events) lines.push(CSV_COLUMNS.map((c) => csvCell(e[c])).join(','));
  return lines.join('\n') + '\n';
}

function parseDate(v: string | undefined, name: string): Date | undefined {
  if (v === undefined) return undefined;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw new ValidationError(`${name}: дата ISO 8601`, name);
  return d;
}

@ApiTags('Аудит')
@Roles('admin', 'auditor')
@Controller('audit')
export class AuditController {
  constructor(@Inject(AUDIT_LOG) private readonly audit: AuditLog) {}

  @Get('events')
  @ApiOperation({ summary: 'Журнал аудита (новые сверху)' })
  list(@Query('limit') limit?: string, @Query('before') before?: string): Promise<AuditEventView[]> {
    const n = limit === undefined ? 100 : Number(limit);
    if (!Number.isInteger(n) || n < 1 || n > 500) throw new ValidationError('limit: от 1 до 500', 'limit');
    const b = before === undefined ? undefined : Number(before);
    if (b !== undefined && !Number.isInteger(b)) throw new ValidationError('before: целое число', 'before');
    return this.audit.list(n, b);
  }

  @Get('export')
  @ApiOperation({
    summary: 'Выгрузка журнала (CSV или JSON) с результатом проверки цепочки',
    description:
      'Записи по возрастанию seq, фильтры from/to (ISO 8601, to — не включительно) и action. ' +
      'В заголовках X-Audit-Chain-OK и X-Audit-Chain-Events — результат проверки всей цепочки на момент выгрузки. ' +
      'Не более 10 000 записей за запрос (X-Audit-Truncated: true, если обрезано).',
  })
  async export(
    @Res({ passthrough: true }) res: Response,
    @Query('format') format = 'json',
    @Query('from') from?: string,
    @Query('to') to?: string,
    @Query('action') action?: string,
  ): Promise<string | AuditEventView[]> {
    if (format !== 'csv' && format !== 'json') throw new ValidationError('format: csv или json', 'format');
    const limit = 10_000;
    const rows = await this.audit.export({
      from: parseDate(from, 'from'),
      to: parseDate(to, 'to'),
      action: action === '' ? undefined : action,
      limit: limit + 1,
    });
    const truncated = rows.length > limit;
    const events = truncated ? rows.slice(0, limit) : rows;
    const chain = await this.audit.verify();
    res.setHeader('X-Audit-Chain-OK', String(chain.ok));
    res.setHeader('X-Audit-Chain-Events', String(chain.events));
    res.setHeader('X-Audit-Truncated', String(truncated));
    res.setHeader('Cache-Control', 'no-store');
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Disposition', `attachment; filename="audit-${stamp}.${format}"`);
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      return '\uFEFF' + toCsv(events);
    }
    return events;
  }

  @Get('verify')
  @ApiOperation({ summary: 'Проверка целостности цепочки хэшей' })
  verify(): Promise<ChainVerification> {
    return this.audit.verify();
  }
}
