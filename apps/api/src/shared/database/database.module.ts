import { Global, Inject, Module, type OnApplicationShutdown } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/env';
import { createDb, type Db, KYSELY } from './kysely';

@Global()
@Module({
  providers: [
    {
      provide: KYSELY,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => createDb(config.DATABASE_URL),
    },
  ],
  exports: [KYSELY],
})
export class DatabaseModule implements OnApplicationShutdown {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async onApplicationShutdown(): Promise<void> {
    await this.db.destroy();
  }
}
