import {
  avatarUploadSchema,
  type LoginEventDto,
  loginEventSchema,
  type UpdateProfileRequest,
  updateProfileSchema,
  type UserSessionDto,
  userSessionSchema,
  z,
} from '@bioauth/contracts';
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';

import { type AuthUser, CurrentUser, Public } from '../../../shared/auth/auth';
import { NotFoundError } from '../../../shared/errors';
import { UuidPipe, ZodValidationPipe } from '../../../shared/http/zod-validation.pipe';
import { ApiZodBody, ApiZodOk } from '../../../shared/swagger/api-zod';
import { AccountService } from '../application/account.service';

const limitSchema = z.coerce.number().int().min(1).max(200).default(50);

@ApiTags('Учётная запись')
@Controller('identity')
export class AccountController {
  constructor(private readonly account: AccountService) {}

  @Patch('me')
  @HttpCode(204)
  @ApiOperation({ summary: 'Изменить имя и почту' })
  @ApiZodBody(updateProfileSchema)
  async update(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(updateProfileSchema)) body: UpdateProfileRequest,
  ): Promise<void> {
    await this.account.updateProfile(user, body);
  }

  @Put('me/avatar')
  @HttpCode(204)
  @ApiOperation({ summary: 'Загрузить аватар (data URL PNG, JPEG или WebP, до 1 МБ)' })
  @ApiZodBody(avatarUploadSchema)
  async setAvatar(
    @CurrentUser() user: AuthUser,
    @Body(new ZodValidationPipe(avatarUploadSchema)) body: { image: string },
  ): Promise<void> {
    await this.account.setAvatar(user, body.image);
  }

  @Delete('me/avatar')
  @HttpCode(204)
  async deleteAvatar(@CurrentUser() user: AuthUser): Promise<void> {
    await this.account.deleteAvatar(user);
  }

  @Get('sessions')
  @ApiOperation({ summary: 'Активные сессии и устройства' })
  @ApiZodOk(z.array(userSessionSchema))
  sessions(@CurrentUser() user: AuthUser): Promise<UserSessionDto[]> {
    return this.account.sessionsOf(user);
  }

  @Delete('sessions/:id')
  @HttpCode(204)
  @ApiOperation({ summary: 'Завершить сессию на другом устройстве' })
  async revoke(@CurrentUser() user: AuthUser, @Param('id', UuidPipe) id: string): Promise<void> {
    await this.account.revokeSession(user, id);
  }

  @Post('sessions/revoke-others')
  @HttpCode(200)
  @ApiOperation({ summary: 'Завершить все сессии, кроме текущей' })
  async revokeOthers(@CurrentUser() user: AuthUser): Promise<{ revoked: number }> {
    return { revoked: await this.account.revokeOthers(user) };
  }

  @Get('login-history')
  @ApiOperation({ summary: 'История входов: успешные и отклонённые' })
  @ApiZodOk(z.array(loginEventSchema))
  history(
    @CurrentUser() user: AuthUser,
    @Query('limit', new ZodValidationPipe(limitSchema)) limit: number,
  ): Promise<LoginEventDto[]> {
    return this.account.history(user, limit);
  }
}

/** Аватары открыты по идентификатору пользователя: на них ссылается claim picture в ID-токене OIDC. */
@ApiTags('Учётная запись')
@Public()
@Controller('avatars')
export class AvatarController {
  constructor(private readonly account: AccountService) {}

  @Get(':userId')
  @ApiOperation({ summary: 'Аватар пользователя' })
  async get(
    @Param('userId', UuidPipe) userId: string,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<StreamableFile | undefined> {
    const a = await this.account.avatar(userId);
    if (!a) throw new NotFoundError('аватар не загружен');
    const etag = `"${a.updatedAt.getTime().toString(36)}"`;
    res.setHeader('etag', etag);
    res.setHeader('cache-control', 'public, max-age=300');
    res.setHeader('x-content-type-options', 'nosniff');
    if (req.headers['if-none-match'] === etag) {
      res.status(304);
      return undefined;
    }
    res.setHeader('content-type', a.mime);
    return new StreamableFile(a.data);
  }
}
