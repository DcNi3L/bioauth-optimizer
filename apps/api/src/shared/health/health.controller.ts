import { CORE_VERSION } from '@bioauth/optimization-core';
import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { sql } from 'kysely';

import { type Db, KYSELY } from '../database/kysely';

@ApiTags('Служебное')
@Controller('health')
export class HealthController {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  @Get('live')
  live() {
    return { status: 'ok', coreVersion: CORE_VERSION };
  }

  /** Готовность: проверяется реальное соединение с БД. */
  @Get('ready')
  async ready() {
    try {
      await sql`SELECT 1`.execute(this.db);
      return { status: 'ok', database: 'up' };
    } catch {
      throw new ServiceUnavailableException('база данных недоступна');
    }
  }
}
