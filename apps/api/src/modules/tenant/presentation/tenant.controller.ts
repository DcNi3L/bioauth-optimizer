import {
  type TenantSettingsDto,
  tenantSettingsDtoSchema,
  type UpdateTenantSettings,
  updateTenantSettingsSchema,
} from '@bioauth/contracts';
import { Body, Controller, Get, Patch } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';

import { type AuthUser, CurrentUser, Public, RequireRecentMfa, Roles } from '../../../shared/auth/auth';
import { ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { TenantSettingsService } from '../application/tenant-settings.service';

@ApiTags('Настройки тенанта')
@Controller()
export class TenantController {
  constructor(private readonly settings: TenantSettingsService) {}

  @Public()
  @Get('tenant/settings')
  @ApiOperation({
    summary: 'Брендинг страницы входа и параметры входа (открыто: их показывает страница входа)',
  })
  @ApiZodOk(tenantSettingsDtoSchema)
  get(): Promise<TenantSettingsDto> {
    return this.settings.get();
  }

  @Patch('admin/tenant/settings')
  @Roles('admin')
  @RequireRecentMfa()
  @ApiOperation({ summary: 'Изменить брендинг и параметры входа' })
  @ApiZodBody(updateTenantSettingsSchema)
  @ApiZodOk(tenantSettingsDtoSchema)
  update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateTenantSettingsSchema)) body: UpdateTenantSettings,
  ): Promise<TenantSettingsDto> {
    return this.settings.update(user, body);
  }
}
