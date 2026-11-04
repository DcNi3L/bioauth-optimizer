import type { MeDto } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import type { AuthUser } from '../../../shared/auth/auth';
import { type Db, KYSELY } from '../../../shared/database/kysely';

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

  async me(user: AuthUser): Promise<MeDto> {
    const [consent, face, passkeys] = await Promise.all([
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
    ]);
    return {
      id: user.id,
      login: user.login,
      displayName: user.displayName,
      role: user.role,
      mfaComplete: user.mfaComplete,
      consent: consent
        ? { textVersion: consent.text_version, grantedAt: consent.granted_at.toISOString() }
        : null,
      face: face
        ? {
            modelVersion: face.model_version,
            samples: face.samples,
            updatedAt: face.updated_at.toISOString(),
          }
        : null,
      passkeys,
    };
  }
}
