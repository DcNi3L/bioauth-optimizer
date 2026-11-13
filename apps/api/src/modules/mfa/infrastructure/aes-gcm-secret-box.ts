import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import type { SealedSecret, SecretBox } from '../application/ports';

const TAG_LEN = 16;

/** AES-256-GCM, ключи те же, что у шаблонов (TEMPLATE_KEYS); AAD = «totp|id пользователя». */
@Injectable()
export class AesGcmSecretBox implements SecretBox {
  private readonly keys: Record<string, Buffer>;
  private readonly activeKeyId: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.keys = config.TEMPLATE_KEYS;
    this.activeKeyId = config.TEMPLATE_ACTIVE_KEY;
  }

  private key(id: string): Buffer {
    const k = this.keys[id];
    if (!k) throw new Error(`ключ «${id}» не задан в TEMPLATE_KEYS`);
    return k;
  }

  seal(userId: string, secret: Buffer): SealedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(this.activeKeyId), iv, { authTagLength: TAG_LEN });
    cipher.setAAD(Buffer.from(`totp|${userId}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(secret), cipher.final(), cipher.getAuthTag()]);
    return { ciphertext, iv, keyId: this.activeKeyId };
  }

  open(userId: string, s: SealedSecret): Buffer {
    const body = s.ciphertext.subarray(0, s.ciphertext.length - TAG_LEN);
    const tag = s.ciphertext.subarray(s.ciphertext.length - TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.key(s.keyId), s.iv, { authTagLength: TAG_LEN });
    decipher.setAAD(Buffer.from(`totp|${userId}`, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  }
}
