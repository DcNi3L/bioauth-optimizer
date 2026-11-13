import type { MeDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { type Db, KYSELY } from '../../../shared/database/kysely';
import { CURRENT_CONSENT_VERSION } from '../../consent/application/consent-texts';

/** Сторона чтения: профиль текущего пользователя (согласие, шаблон, число passkey) одним запросом в БД на таблицу. */
@Injectable()
export class MeQuery {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async passkeyCount(userId: string): Promise<number> {
    const r = await this.db
      .selectFrom('webauthn_credential')
      .select((eb) => eb.fn.countAll<string>().as('n'))
      .where('user_id', '=', userId)
      .executeTakeFirstOrThrow();
    return Number(r.n);
  }

  /** Включён ли подтверждённый TOTP: он считается вторым фактором наравне с passkey. */
  async totpEnabled(userId: string): Promise<boolean> {
    const r = await this.db
      .selectFrom('user_totp')
      .select('user_id')
      .where('user_id', '=', userId)
      .where('confirmed_at', 'is not', null)
      .executeTakeFirst();
    return r !== undefined;
  }

  async me(user: AuthUser): Promise<MeDto> {
    const [consent, face, passkeys, totp, account, avatar] = await Promise.all([
      this.db
        .selectFrom('consent')
        .select(['text_version', 'granted_at'])
        .where('user_id', '=', user.id)
        .where('revoked_at', 'is', null)
        .executeTakeFirst(),
      this.db
        .selectFrom('face_template')
        .select(['model_version', 'samples', 'updated_at'])
        .where('user_id', '=', user.id)
        .executeTakeFirst(),
      this.passkeyCount(user.id),
      this.totpEnabled(user.id),
      this.db
        .selectFrom('app_user')
        .select(['email', 'created_at', 'last_login_at'])
        .where('id', '=', user.id)
        .executeTakeFirstOrThrow(),
      this.db
        .selectFrom('user_avatar')
        .select('updated_at')
        .where('user_id', '=', user.id)
        .executeTakeFirst(),
    ]);
    return {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      role: user.role,
      mfaComplete: user.mfaComplete,
      consent: consent
        ? {
            textVersion: consent.text_version,
            grantedAt: consent.granted_at.toISOString(),
            current: consent.text_version === CURRENT_CONSENT_VERSION,
          }
        : null,
      face: face
        ? {
            modelVersion: face.model_version,
            samples: face.samples,
            updatedAt: face.updated_at.toISOString(),
          }
        : null,
      passkeys,
      totp,
      email: account.email,
      createdAt: account.created_at.toISOString(),
      lastLoginAt: account.last_login_at?.toISOString() ?? null,
      avatarUrl: avatar ? `/api/v1/avatars/${user.id}?v=${avatar.updated_at.getTime().toString(36)}` : null,
      amr: [...user.amr],
    };
  }
}
