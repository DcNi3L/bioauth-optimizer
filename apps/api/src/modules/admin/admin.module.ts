import { Module } from '@nestjs/common';

import { AdminUsersService } from './application/admin-users.service';
import { AdminQuery } from './infrastructure/admin.query';
import { AdminController } from './presentation/admin.controller';

/** Админ-панель v3: пользователи, сессии, сводка. Зависимости идентификации — из глобального IdentityModule. */
@Module({
  controllers: [AdminController],
  providers: [AdminQuery, AdminUsersService],
})
export class AdminModule {}
