import {
  createCipheriv,
  createDecipheriv,
  createPrivateKey,
  generateKeyPairSync,
  hkdfSync,
  type KeyObject,
  randomBytes,
} from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import { publicKeyFromJwk } from '../../../shared/crypto/jwt';
import { OIDC_REPOSITORY, type OidcRepository } from './ports';

interface LoadedKey {
  kid: string;
  privateKey: KeyObject;
}

/**
 * Ключи подписи токенов RS256. Пара RSA-2048 создаётся при первом обращении; закрытый ключ хранится
 * зашифрованным AES-256-GCM ключом, выведенным (HKDF) из активного ключа шаблонов TEMPLATE_KEYS.
 * Открытые ключи всех версий публикуются в JWKS, чтобы токены, подписанные до ротации, проверялись.
 */
@Injectable()
export class KeysService {
  private readonly logger = new Logger('OidcKeys');
  private active: Promise<LoadedKey> | null = null;
  private publics = new Map<string, KeyObject>();

  constructor(
    @Inject(OIDC_REPOSITORY) private readonly repo: OidcRepository,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  private kek(kekId: string): Buffer | null {
    const base = this.config.TEMPLATE_KEYS[kekId];
    return base ? Buffer.from(hkdfSync('sha256', base, 'bioauth-oidc', 'signing-key', 32)) : null;
  }

  async signingKey(): Promise<LoadedKey> {
    this.active ??= this.load().catch((err: unknown) => {
      this.active = null;
      throw err;
    });
    return this.active;
  }

  private async load(): Promise<LoadedKey> {
    const keys = await this.repo.signingKeys();
    for (const k of keys) this.publics.set(k.kid, publicKeyFromJwk(k.publicJwk));
    const current = keys.find((k) => k.active);
    const kek = current ? this.kek(current.kekId) : null;
    if (current && kek) {
      const decipher = createDecipheriv('aes-256-gcm', kek, current.iv);
      decipher.setAuthTag(current.privateEnc.subarray(-16));
      const pem = Buffer.concat([
        decipher.update(current.privateEnc.subarray(0, -16)),
        decipher.final(),
      ]).toString('utf8');
      return { kid: current.kid, privateKey: createPrivateKey(pem) };
    }
    return this.rotate();
  }

  /** Новая пара ключей; прежние остаются в JWKS. */
  async rotate(): Promise<LoadedKey> {
    const { publicKey, privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const kid = randomBytes(8).toString('base64url');
    const kekId = this.config.TEMPLATE_ACTIVE_KEY;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.kek(kekId)!, iv);
    const pem = privateKey.export({ format: 'pem', type: 'pkcs8' });
    const privateEnc = Buffer.concat([cipher.update(pem), cipher.final(), cipher.getAuthTag()]);
    const publicJwk = {
      ...(publicKey.export({ format: 'jwk' }) as Record<string, unknown>),
      kid,
      alg: 'RS256',
      use: 'sig',
    };
    await this.repo.saveSigningKey({ kid, publicJwk, privateEnc, iv, kekId });
    this.publics.set(kid, publicKey);
    this.logger.log(`создан ключ подписи OIDC ${kid}`);
    const loaded = { kid, privateKey };
    this.active = Promise.resolve(loaded);
    return loaded;
  }

  async jwks(): Promise<{ keys: Record<string, unknown>[] }> {
    await this.signingKey();
    const keys = await this.repo.signingKeys();
    return { keys: keys.map((k) => ({ ...k.publicJwk, kid: k.kid, alg: 'RS256', use: 'sig' })) };
  }

  publicKey(kid: string): KeyObject | null {
    return this.publics.get(kid) ?? null;
  }
}
