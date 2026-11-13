import type { TenantSettingsDto, UpdateTenantSettings } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { TenantSettingsTable } from '../../../shared/database/schema';

const COLUMNS = {
  productName: 'product_name',
  accentColor: 'accent_color',
  logoUrl: 'logo_url',
  loginTitle: 'login_title',
  loginSubtitle: 'login_subtitle',
  supportUrl: 'support_url',
  privacyUrl: 'privacy_url',
  termsUrl: 'terms_url',
  allowSignup: 'allow_signup',
  allowCrossDevice: 'allow_cross_device',
} as const satisfies Record<keyof UpdateTenantSettings, keyof TenantSettingsTable>;

/** Единственная строка настроек тенанта (миграция 0012 создаёт её со значениями по умолчанию). */
@Injectable()
export class KyselyTenantSettingsStore {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async read(): Promise<TenantSettingsDto> {
    const r = await this.db
      .selectFrom('tenant_settings')
      .selectAll()
      .where('id', '=', true)
      .executeTakeFirstOrThrow();
    return {
      productName: r.product_name,
      accentColor: r.accent_color,
      logoUrl: r.logo_url,
      loginTitle: r.login_title,
      loginSubtitle: r.login_subtitle,
      supportUrl: r.support_url,
      privacyUrl: r.privacy_url,
      termsUrl: r.terms_url,
      allowSignup: r.allow_signup,
      allowCrossDevice: r.allow_cross_device,
      updatedAt: r.updated_at?.toISOString() ?? null,
    };
  }

  async update(patch: UpdateTenantSettings, actorId: string): Promise<void> {
    const values: Record<string, unknown> = { updated_at: new Date(), updated_by: actorId };
    for (const [key, column] of Object.entries(COLUMNS)) {
      const v = patch[key as keyof UpdateTenantSettings];
      if (v !== undefined) values[column] = v;
    }
    await this.db.updateTable('tenant_settings').set(values).where('id', '=', true).execute();
  }
}
