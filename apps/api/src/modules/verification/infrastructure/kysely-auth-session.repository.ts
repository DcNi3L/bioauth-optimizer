import type { LivenessCommand } from '@bioauth/contracts';
import { Inject, Injectable } from '@nestjs/common';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type { AuthSessionRecord, AuthSessionRepository } from '../application/ports';

@Injectable()
export class KyselyAuthSessionRepository implements AuthSessionRepository {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async create(s: {
    userId: string | null;
    policyId: string;
    nonce: string;
    commands: LivenessCommand[];
    expiresAt: Date;
  }) {
    const r = await this.db
      .insertInto('auth_session')
      .values({
        user_id: s.userId,
        policy_id: s.policyId,
        nonce: s.nonce,
        commands: s.commands,
        state: 'pending',
        expires_at: s.expiresAt,
      })
      .returning('id')
      .executeTakeFirstOrThrow();
    return r.id;
  }

  async find(id: string): Promise<AuthSessionRecord | null> {
    const r = await this.db.selectFrom('auth_session').selectAll().where('id', '=', id).executeTakeFirst();
    return r
      ? {
          id: r.id,
          userId: r.user_id,
          policyId: r.policy_id,
          commands: r.commands as LivenessCommand[],
          stepIndex: r.step_index,
          failures: r.failures,
          state: r.state,
          webauthnChallenge: r.webauthn_challenge,
          expiresAt: r.expires_at,
        }
      : null;
  }

  async update(
    id: string,
    expected: { stepIndex: number; failures: number },
    patch: Parameters<AuthSessionRepository['update']>[2],
  ): Promise<boolean> {
    const done = patch.state !== undefined && patch.state !== 'pending';
    const r = await this.db
      .updateTable('auth_session')
      .set({
        ...(patch.stepIndex !== undefined && { step_index: patch.stepIndex }),
        ...(patch.failures !== undefined && { failures: patch.failures }),
        ...(patch.state !== undefined && { state: patch.state }),
        ...(patch.commands !== undefined && { commands: patch.commands }),
        ...(patch.webauthnChallenge !== undefined && { webauthn_challenge: patch.webauthnChallenge }),
        ...(patch.faceAccepted !== undefined && { face_accepted: patch.faceAccepted }),
        ...(done && { completed_at: new Date() }),
      })
      .where('id', '=', id)
      .where('state', '=', 'pending')
      .where('step_index', '=', expected.stepIndex)
      .where('failures', '=', expected.failures)
      .executeTakeFirst();
    return r.numUpdatedRows > 0n;
  }

  async setChallenge(id: string, challenge: string | null): Promise<void> {
    await this.db
      .updateTable('auth_session')
      .set({ webauthn_challenge: challenge })
      .where('id', '=', id)
      .execute();
  }

  async acceptedAttempt(sessionId: string, factor: 'face' | 'keystroke') {
    const r = await this.db
      .selectFrom('auth_attempt')
      .select(['id', 'score', 'model_version'])
      .where('session_id', '=', sessionId)
      .where('factor', '=', factor)
      .where('outcome', '=', 'accept')
      .orderBy('created_at', 'desc')
      .limit(1)
      .executeTakeFirst();
    if (r === undefined) return null;
    const { id, score, model_version: modelVersion } = r;
    return score === null || modelVersion === null ? null : { id, score, modelVersion };
  }
}
