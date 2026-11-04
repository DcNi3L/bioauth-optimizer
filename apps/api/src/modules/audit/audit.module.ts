import { Global, Module } from '@nestjs/common';

import { AUDIT_LOG } from './application/audit-log';
import { KyselyAuditLog } from './infrastructure/kysely-audit-log';
import { AuditController } from './presentation/audit.controller';

@Global()
@Module({
  controllers: [AuditController],
  providers: [{ provide: AUDIT_LOG, useClass: KyselyAuditLog }],
  exports: [AUDIT_LOG],
})
export class AuditModule {}
