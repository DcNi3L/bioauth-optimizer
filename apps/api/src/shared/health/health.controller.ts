import { CORE_VERSION } from '@bioauth/optimization-core';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'kysely';

import { Public } from '../auth/auth';
import { APP_CONFIG, type AppConfig } from '../config/env';
import { type Db, KYSELY } from '../database/kysely';

@ApiTags('Служебное')
// v1 — расчётный инструмент проектировщика, открыт без входа (ADR-0005); v2 закрыт по умолчанию.
@Public()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(KYSELY) private readonly db: Db,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('live')
  live() {
    return { status: 'ok', coreVersion: CORE_VERSION };
  }

  /**
   * Готовность: соединение с БД обязательно (иначе 503). Сервис распознавания проверяется отдельно: без него API
   * отвечает (политики, OIDC, вход по паролю и passkey), поэтому его недоступность — `degraded`, а не 503.
   */
  @Get('ready')
  async ready() {
    let migration: string | null;
    try {
      const r = await sql<{
        name: string | null;
      }>`SELECT max(name) AS name FROM schema_migrations`.execute(this.db);
      migration = r.rows[0]?.name ?? null;
    } catch {
      throw new ServiceUnavailableException('база данных недоступна');
    }
    const bioEngine = await this.probeBioEngine();
    return {
      status: bioEngine === 'up' ? 'ok' : 'degraded',
      database: 'up',
      migration,
      bioEngine,
      coreVersion: CORE_VERSION,
    };
  }

  private async probeBioEngine(): Promise<'up' | 'down'> {
    try {
      const res = await fetch(new URL('/health/ready', this.config.BIO_ENGINE_URL), {
        signal: AbortSignal.timeout(2000),
      });
      return res.ok ? 'up' : 'down';
    } catch {
      return 'down';
    }
  }
}
