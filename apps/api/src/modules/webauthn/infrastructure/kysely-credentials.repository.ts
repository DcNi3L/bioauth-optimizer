import { Inject, Injectable } from '@nestjs/common';
import { sql } from 'kysely';

import { type Db, KYSELY } from '../../../shared/database/kysely';
import type {
  ChallengeStore,
  CredentialRepository,
  RegistrationResult,
  StoredCredential,
} from '../application/ports';

interface Row {
  credential_id: string;
  user_id: string;
  public_key: Buffer;
  counter: string;
  transports: string[];
  device_type: string;
  backed_up: boolean;
}

const toCred = (r: Row): StoredCredential => ({
  credentialId: r.credential_id,
  userId: r.user_id,
  publicKey: r.public_key,
  counter: Number(r.counter),
  transports: r.transports,
  deviceType: r.device_type,
  backedUp: r.backed_up,
});
const COLS = [
  'credential_id',
  'user_id',
  'public_key',
  'counter',
  'transports',
  'device_type',
  'backed_up',
] as const;

@Injectable()
export class KyselyCredentialRepository implements CredentialRepository, ChallengeStore {
  constructor(@Inject(KYSELY) private readonly db: Db) {}

  async listForUser(userId: string): Promise<StoredCredential[]> {
    return (
      await this.db.selectFrom('webauthn_credential').select(COLS).where('user_id', '=', userId).execute()
    ).map(toCred);
  }

  async find(credentialId: string): Promise<StoredCredential | null> {
    const r = await this.db
      .selectFrom('webauthn_credential')
      .select(COLS)
      .where('credential_id', '=', credentialId)
      .executeTakeFirst();
    return r ? toCred(r) : null;
  }

  async add(userId: string, c: RegistrationResult): Promise<void> {
    await this.db
      .insertInto('webauthn_credential')
      .values({
        credential_id: c.credentialId,
        user_id: userId,
        public_key: c.publicKey,
        counter: c.counter,
        transports: c.transports,
        device_type: c.deviceType,
        backed_up: c.backedUp,
      })
      .execute();
  }

  async delete(userId: string, credentialId: string): Promise<boolean> {
    const r = await this.db
      .deleteFrom('webauthn_credential')
      .where('user_id', '=', userId)
      .where('credential_id', '=', credentialId)
      .executeTakeFirst();
    return r.numDeletedRows > 0n;
  }

  async touch(credentialId: string, newCounter: number): Promise<void> {
    await this.db
      .updateTable('webauthn_credential')
      .set({ counter: sql<number>`GREATEST(counter, ${newCounter})`, last_used_at: new Date() })
      .where('credential_id', '=', credentialId)
      .execute();
  }

  async setForUserSession(sessionId: string, challenge: string | null): Promise<void> {
    await this.db
      .updateTable('user_session')
      .set({ webauthn_challenge: challenge })
      .where('id', '=', sessionId)
      .execute();
  }

  async getForUserSession(sessionId: string): Promise<string | null> {
    const r = await this.db
      .selectFrom('user_session')
      .select('webauthn_challenge')
      .where('id', '=', sessionId)
      .executeTakeFirst();
    return r?.webauthn_challenge ?? null;
  }
}
