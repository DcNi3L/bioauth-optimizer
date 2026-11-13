import { Global, Module } from '@nestjs/common';

import { TenantSettingsService } from './application/tenant-settings.service';
import { KyselyTenantSettingsStore } from './infrastructure/kysely-tenant-settings.store';
import { TenantController } from './presentation/tenant.controller';

/** Глобальный: регистрация и вход с телефона проверяют, разрешены ли они. */
@Global()
@Module({
  controllers: [TenantController],
  providers: [KyselyTenantSettingsStore, TenantSettingsService],
  exports: [TenantSettingsService],
})
export class TenantModule {}
