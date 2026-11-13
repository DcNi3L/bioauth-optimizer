import {
  type AdminCreateUser,
  adminCreateUserSchema,
  type AdminLoginEventDto,
  adminLoginEventSchema,
  type AdminStatsDto,
  adminStatsSchema,
  type AdminUpdateUser,
  adminUpdateUserSchema,
  type AdminUserDetailDto,
  adminUserDetailSchema,
  type AdminUserDto,
  adminUserSchema,
  type AdminUsersPageDto,
  adminUsersPageSchema,
  roleSchema,
  z,
} from '@bioauth/contracts';
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';

import { type AuthUser, CurrentUser, RequireMfa, RequireRecentMfa, Roles } from '../../../shared/auth/auth';
import { csvTable } from '../../../shared/http/csv';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { AdminUsersService } from '../application/admin-users.service';
import { AdminQuery } from '../infrastructure/admin.query';

const listQuery = z.object({
  q: z.string().trim().max(100).optional(),
  role: roleSchema.optional(),
  status: z.enum(['locked', 'disabled', 'active']).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  offset: z.coerce.number().int().min(0).default(0),
});

const exportQuery = listQuery.omit({ limit: true, offset: true }).extend({
  format: z.enum(['csv', 'json']).default('csv'),
});
const EXPORT_LIMIT = 10_000;
const EXPORT_COLUMNS = [
  'id',
  'login',
  'displayName',
  'email',
  'role',
  'createdAt',
  'lastLoginAt',
  'disabled',
  'lockedUntil',
  'face',
  'passkeys',
  'consent',
  'activeSessions',
] as const satisfies readonly (keyof AdminUserDto)[];

const eventsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  failures: z.enum(['true', 'false']).default('false'),
});

@ApiTags('Админ-панель')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly query: AdminQuery,
    private readonly service: AdminUsersService,
  ) {}

  @Get('stats')
  @Roles('admin', 'auditor', 'researcher')
  @ApiOperation({ summary: 'Сводка: пользователи, сессии, входы за 14 дней, приложения OAuth' })
  @ApiZodOk(adminStatsSchema)
  stats(): Promise<AdminStatsDto> {
    return this.query.stats();
  }

  @Get('users')
  @Roles('admin', 'auditor')
  @ApiZodOk(adminUsersPageSchema)
  users(@Query(new ZodValidationPipe(listQuery)) q: z.output<typeof listQuery>): Promise<AdminUsersPageDto> {
    return this.query.users({
      q: q.q === undefined || q.q === '' ? null : q.q,
      role: q.role ?? null,
      status: q.status ?? null,
      limit: q.limit,
      offset: q.offset,
    });
  }

  @Get('users/export')
  @Roles('admin', 'auditor')
  @ApiOperation({
    summary: 'Выгрузить пользователей (CSV или JSON) по тем же фильтрам, что и список',
    description: `Не более ${EXPORT_LIMIT} записей. Биометрия не выгружается — только признаки наличия.`,
  })
  async exportUsers(
    @Res({ passthrough: true }) res: Response,
    @Query(new ZodValidationPipe(exportQuery)) q: z.output<typeof exportQuery>,
  ): Promise<string | AdminUserDto[]> {
    const items = await this.query.exportUsers(
      { q: q.q === undefined || q.q === '' ? null : q.q, role: q.role ?? null, status: q.status ?? null },
      EXPORT_LIMIT,
    );
    const stamp = new Date().toISOString().slice(0, 10);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Disposition', `attachment; filename="users-${stamp}.${q.format}"`);
    if (q.format === 'json') return items;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    return csvTable(EXPORT_COLUMNS, items);
  }

  @Post('users')
  @HttpCode(201)
  @Roles('admin')
  @RequireMfa()
  @ApiOperation({ summary: 'Создать сотрудника (администратор, исследователь, аудитор)' })
  @ApiZodBody(adminCreateUserSchema)
  @ApiZodOk(adminUserSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(adminCreateUserSchema))
    body: z.output<typeof adminCreateUserSchema> & AdminCreateUser,
  ): Promise<AdminUserDto> {
    return this.service.create(user, body);
  }

  @Get('users/:id')
  @Roles('admin', 'auditor')
  @ApiZodOk(adminUserDetailSchema)
  detail(@Param('id', UuidPipe) id: string): Promise<AdminUserDetailDto> {
    return this.service.detail(id);
  }

  @Patch('users/:id')
  @Roles('admin')
  @RequireRecentMfa()
  @ApiOperation({ summary: 'Роль, отключение, снятие блокировки, имя' })
  @ApiZodBody(adminUpdateUserSchema)
  @ApiZodOk(adminUserSchema)
  update(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(adminUpdateUserSchema)) body: AdminUpdateUser,
  ): Promise<AdminUserDto> {
    return this.service.update(user, id, body);
  }

  @Delete('users/:id/sessions')
  @Roles('admin')
  @RequireMfa()
  @ApiOperation({ summary: 'Завершить все сессии пользователя' })
  async revoke(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
  ): Promise<{ revoked: number }> {
    return { revoked: await this.service.revokeSessions(user, id) };
  }

  @Get('login-events')
  @Roles('admin', 'auditor')
  @ApiOperation({ summary: 'Последние входы всех пользователей' })
  @ApiZodOk(z.array(adminLoginEventSchema))
  events(
    @Query(new ZodValidationPipe(eventsQuery)) q: z.output<typeof eventsQuery>,
  ): Promise<AdminLoginEventDto[]> {
    return this.query.recentLogins(q.limit, q.failures === 'true');
  }
}
