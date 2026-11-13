import type { TenantSettingsDto, UpdateTenantSettings } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { ForbiddenError } from '../../../shared/errors';
import { AUDIT_LOG, type AuditLog } from '../../audit/application/audit-log';
import { KyselyTenantSettingsStore } from '../infrastructure/kysely-tenant-settings.store';

/** Сколько живёт копия настроек в памяти: их читает каждая страница входа, а меняют редко. */
const CACHE_MS = 5_000;

/**
 * Настройки тенанта: брендинг страницы входа и параметры входа. Самостоятельная регистрация и вход с телефона
 * выключаются здесь — как «Disable Sign Ups» и способы входа в Auth0.
 */
@Injectable()
export class TenantSettingsService {
  private cached: { value: TenantSettingsDto; at: number } | null = null;

  constructor(
    private readonly store: KyselyTenantSettingsStore,
    @Inject(AUDIT_LOG) private readonly audit: AuditLog,
  ) {}

  async get(): Promise<TenantSettingsDto> {
    if (this.cached && Date.now() - this.cached.at < CACHE_MS) return this.cached.value;
    const value = await this.store.read();
    this.cached = { value, at: Date.now() };
    return value;
  }

  async update(actor: AuthUser, patch: UpdateTenantSettings): Promise<TenantSettingsDto> {
    const before = await this.store.read();
    await this.store.update(patch, actor.id);
    this.cached = null;
    const after = await this.get();
    const changed = Object.keys(patch).filter(
      (k) => before[k as keyof TenantSettingsDto] !== after[k as keyof TenantSettingsDto],
    );
    if (changed.length > 0) {
      await this.audit.record({ actorId: actor.id, action: 'tenant.updated', details: { changed } });
    }
    return after;
  }

  async assertSignupAllowed(): Promise<void> {
    if (!(await this.get()).allowSignup) {
      throw new ForbiddenError('самостоятельная регистрация выключена администратором');
    }
  }

  async assertCrossDeviceAllowed(): Promise<void> {
    if (!(await this.get()).allowCrossDevice) {
      throw new ForbiddenError('вход с телефона выключен администратором');
    }
  }
}
