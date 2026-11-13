import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../config/env';

export const SECRET_BOX = Symbol('SECRET_BOX');

export interface SealedSecret {
  readonly ciphertext: Buffer;
  readonly iv: Buffer;
  readonly keyId: string;
}

/** Шифрование небольших секретов пользователя: назначение и пользователь входят в AAD и не позволяют «пересадить» шифротекст. */
export interface SecretBox {
  readonly activeKeyId: string;
  seal(purpose: string, userId: string, data: Buffer): SealedSecret;
  open(purpose: string, userId: string, sealed: SealedSecret): Buffer;
}

const TAG_LEN = 16;

/** AES-256-GCM, ключи те же, что у шаблонов (TEMPLATE_KEYS); AAD = «назначение|id пользователя». */
@Injectable()
export class AesGcmSecretBox implements SecretBox {
  private readonly keys: Record<string, Buffer>;
  readonly activeKeyId: string;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.keys = config.TEMPLATE_KEYS;
    this.activeKeyId = config.TEMPLATE_ACTIVE_KEY;
  }

  private key(id: string): Buffer {
    const k = this.keys[id];
    if (!k) throw new Error(`ключ «${id}» не задан в TEMPLATE_KEYS`);
    return k;
  }

  seal(purpose: string, userId: string, data: Buffer): SealedSecret {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key(this.activeKeyId), iv, { authTagLength: TAG_LEN });
    cipher.setAAD(Buffer.from(`${purpose}|${userId}`, 'utf8'));
    const ciphertext = Buffer.concat([cipher.update(data), cipher.final(), cipher.getAuthTag()]);
    return { ciphertext, iv, keyId: this.activeKeyId };
  }

  open(purpose: string, userId: string, s: SealedSecret): Buffer {
    const body = s.ciphertext.subarray(0, s.ciphertext.length - TAG_LEN);
    const tag = s.ciphertext.subarray(s.ciphertext.length - TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', this.key(s.keyId), s.iv, { authTagLength: TAG_LEN });
    decipher.setAAD(Buffer.from(`${purpose}|${userId}`, 'utf8'));
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(body), decipher.final()]);
  }
}
