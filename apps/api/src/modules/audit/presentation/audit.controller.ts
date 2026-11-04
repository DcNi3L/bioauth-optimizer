import { Controller, Get, Inject, Query } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { Roles } from '../../../shared/auth/auth';
import { ValidationError } from '../../../shared/errors';
import {
  AUDIT_LOG,
  type AuditEventView,
  type AuditLog,
  type ChainVerification,
} from '../application/audit-log';

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

  @Get('verify')
  @ApiOperation({ summary: 'Проверка целостности цепочки хэшей' })
  verify(): Promise<ChainVerification> {
    return this.audit.verify();
  }
}
