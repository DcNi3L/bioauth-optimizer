import type { Db } from '../database/kysely';
import type { SealedSecret, SecretBox } from './secret-box';

export interface StoredSecret {
  readonly userId: string;
  readonly sealed: SealedSecret;
}

/** Хранилище секретов одного назначения (purpose входит в AAD). */
export interface SealedSecretStore {
  readonly purpose: string;
  all(): Promise<StoredSecret[]>;
  /** Заменяет шифротекст, только если запись не изменилась после чтения (тот же IV); false — запись поменялась. */
  replace(userId: string, previous: SealedSecret, next: SealedSecret): Promise<boolean>;
}

/**
 * Ротация ключа для секретов TOTP и шаблонов ритма набора (#50): записи со старым key_id расшифровываются
 * своим ключом и шифруются активным. После прогона старый ключ можно убрать из TEMPLATE_KEYS.
 */
export async function rekeySecrets(
  stores: readonly SealedSecretStore[],
  box: SecretBox,
): Promise<Record<string, { checked: number; rekeyed: number; skipped: number }>> {
  const out: Record<string, { checked: number; rekeyed: number; skipped: number }> = {};
  for (const store of stores) {
    const r = { checked: 0, rekeyed: 0, skipped: 0 };
    for (const s of await store.all()) {
      r.checked++;
      if (s.sealed.keyId === box.activeKeyId) continue;
      const plain = box.open(store.purpose, s.userId, s.sealed);
      if (await store.replace(s.userId, s.sealed, box.seal(store.purpose, s.userId, plain))) r.rekeyed++;
      else r.skipped++;
      plain.fill(0);
    }
    out[store.purpose] = r;
  }
  return out;
}

export function totpSecretStore(db: Db): SealedSecretStore {
  return {
    purpose: 'totp',
    async all() {
      const rows = await db
        .selectFrom('user_totp')
        .select(['user_id', 'secret_enc', 'iv', 'key_id'])
        .execute();
      return rows.map((r) => ({
        userId: r.user_id,
        sealed: { ciphertext: r.secret_enc, iv: r.iv, keyId: r.key_id },
      }));
    },
    async replace(userId, prev, next) {
      const r = await db
        .updateTable('user_totp')
        .set({ secret_enc: next.ciphertext, iv: next.iv, key_id: next.keyId })
        .where('user_id', '=', userId)
        .where('iv', '=', prev.iv)
        .executeTakeFirst();
      return r.numUpdatedRows > 0n;
    },
  };
}

export function keystrokeSecretStore(db: Db): SealedSecretStore {
  return {
    purpose: 'keystroke',
    async all() {
      const rows = await db
        .selectFrom('keystroke_template')
        .select(['user_id', 'ciphertext', 'iv', 'key_id'])
        .execute();
      return rows.map((r) => ({
        userId: r.user_id,
        sealed: { ciphertext: r.ciphertext, iv: r.iv, keyId: r.key_id },
      }));
    },
    async replace(userId, prev, next) {
      const r = await db
        .updateTable('keystroke_template')
        .set({ ciphertext: next.ciphertext, iv: next.iv, key_id: next.keyId })
        .where('user_id', '=', userId)
        .where('iv', '=', prev.iv)
        .executeTakeFirst();
      return r.numUpdatedRows > 0n;
    },
  };
}
