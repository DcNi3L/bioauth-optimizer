import {
  type ConnectedAppDto,
  connectedAppSchema,
  type CreateOauthClient,
  createOauthClientSchema,
  oauthClientCreatedSchema,
  type OauthClientDto,
  oauthClientSchema,
  oauthDecisionSchema,
  oauthLogoutInfoSchema,
  type OauthLogoutRequest,
  oauthLogoutRequestSchema,
  oauthRedirectSchema,
  type OauthRequestInfoDto,
  oauthRequestInfoSchema,
  type UpdateOauthClient,
  updateOauthClientSchema,
  z,
} from '@bioauth/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import {
  type AuthUser,
  clearSessionCookie,
  CurrentUser,
  hashSessionToken,
  OptionalUser,
  Public,
  readCookie,
  RequireMfa,
  RequireRecentMfa,
  Roles,
  SESSION_COOKIE,
} from '../../../shared/auth/auth';
import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { SESSION_STORE, type SessionStore } from '../../identity/application/ports';
import { ClientsService } from '../application/clients.service';
import { OidcService } from '../application/oidc.service';

@ApiTags('OpenID Connect')
@Controller('oauth')
export class OauthApiController {
  constructor(
    private readonly oidc: OidcService,
    @Inject(SESSION_STORE) private readonly sessions: SessionStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  @Get('logout')
  @Public()
  @ApiOperation({ summary: 'Название приложения для страницы подтверждения выхода' })
  @ApiQuery({ name: 'client_id', required: false, description: 'Идентификатор приложения' })
  @ApiZodOk(oauthLogoutInfoSchema)
  async logoutInfo(@Query('client_id') clientId: unknown): Promise<{ clientName: string | null }> {
    return {
      clientName: await this.oidc.logoutClientName(typeof clientId === 'string' ? clientId : undefined),
    };
  }

  @Post('logout')
  @Public()
  @HttpCode(200)
  @ApiOperation({
    summary: 'Подтверждённый выход по запросу приложения: завершает сессию и возвращает адрес',
  })
  @ApiZodBody(oauthLogoutRequestSchema)
  @ApiZodOk(oauthRedirectSchema)
  async logout(
    @Body(new ZodValidationPipe(oauthLogoutRequestSchema)) body: OauthLogoutRequest,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<{ redirectTo: string }> {
    const token = readCookie(req, SESSION_COOKIE);
    if (token) await this.sessions.deleteByTokenHash(hashSessionToken(token));
    clearSessionCookie(res, this.config.COOKIE_SECURE);
    return {
      redirectTo: await this.oidc.postLogoutTarget(body.clientId, body.postLogoutRedirectUri, body.state),
    };
  }

  @Get('requests/:id')
  @Public()
  @ApiOperation({ summary: 'Запрос авторизации для страниц входа и согласия (user = null без входа)' })
  @ApiZodOk(oauthRequestInfoSchema)
  request(
    @OptionalUser() user: AuthUser | null,
    @Param('id', UuidPipe) id: string,
  ): Promise<OauthRequestInfoDto> {
    return this.oidc.requestInfo(id, user);
  }

  @Post('requests/:id/decision')
  @HttpCode(200)
  @ApiOperation({ summary: 'Разрешить или отклонить доступ приложению' })
  @ApiZodBody(oauthDecisionSchema)
  @ApiZodOk(oauthRedirectSchema)
  async decide(
    @CurrentUser() user: AuthUser,
    @Param('id', UuidPipe) id: string,
    @Body(new ZodValidationPipe(oauthDecisionSchema)) body: { approve: boolean },
  ): Promise<{ redirectTo: string }> {
    return { redirectTo: (await this.oidc.decide(id, user, body.approve)).redirect };
  }

  @Get('apps')
  @ApiOperation({ summary: 'Подключённые приложения пользователя' })
  @ApiZodOk(z.array(connectedAppSchema))
  apps(@CurrentUser() user: AuthUser): Promise<ConnectedAppDto[]> {
    return this.oidc.connectedApps(user);
  }

  @Delete('apps/:clientId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Отключить приложение: отозвать согласие и refresh-токены' })
  async disconnect(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string): Promise<void> {
    await this.oidc.disconnect(user, clientId);
  }
}

@ApiTags('OpenID Connect')
@Controller('admin/oauth-clients')
export class OauthClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @Roles('admin', 'auditor')
  @ApiZodOk(z.array(oauthClientSchema))
  list(): Promise<OauthClientDto[]> {
    return this.clients.list();
  }

  @Post()
  @HttpCode(201)
  @Roles('admin')
  @RequireMfa()
  @ApiOperation({ summary: 'Зарегистрировать приложение-клиента; секрет показывается один раз' })
  @ApiZodBody(createOauthClientSchema)
  @ApiZodOk(oauthClientCreatedSchema)
  create(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(createOauthClientSchema))
    body: z.output<typeof createOauthClientSchema> & CreateOauthClient,
  ) {
    return this.clients.create(user, body);
  }

  @Patch(':clientId')
  @Roles('admin')
  @RequireRecentMfa()
  @ApiZodBody(updateOauthClientSchema)
  @ApiZodOk(oauthClientCreatedSchema)
  update(
    @CurrentUser() user: AuthUser,
    @Param('clientId') clientId: string,
    @Body(new ZodValidationPipe(updateOauthClientSchema)) body: UpdateOauthClient,
  ) {
    return this.clients.update(user, clientId, body);
  }

  @Delete(':clientId')
  @HttpCode(204)
  @Roles('admin')
  @RequireRecentMfa()
  async remove(@CurrentUser() user: AuthUser, @Param('clientId') clientId: string): Promise<void> {
    await this.clients.remove(user, clientId);
  }
}
