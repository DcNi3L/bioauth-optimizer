import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

import { Inject, Injectable, Logger } from '@nestjs/common';

import { APP_CONFIG, type AppConfig } from '../../../shared/config/env';
import type { EncryptedTemplate, TemplateCipher } from '../application/ports';
import { orthogonalMatrix, project, unproject } from './projection';

const TAG_LEN = 16;

const toBuffer = (v: readonly number[]): Buffer => Buffer.from(Float64Array.from(v).buffer);
const fromBuffer = (b: Buffer): number[] =>
  Array.from(new Float64Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)));

/**
 * AES-256-GCM с уникальным IV на запись и AAD = субъект | версия модели | признак проекции:
 * шифротекст нельзя «пересадить» другому субъекту или выдать за шаблон другой модели.
 */
@Injectable()
export class AesGcmTemplateCipher implements TemplateCipher {
  readonly activeKeyId: string;
  private readonly keys: Record<string, Buffer>;
  private readonly cancelable: boolean;

  constructor(@Inject(APP_CONFIG) config: AppConfig) {
    this.keys = config.TEMPLATE_KEYS;
    this.activeKeyId = config.TEMPLATE_ACTIVE_KEY;
    this.cancelable = config.TEMPLATE_CANCELABLE;
    if (this.activeKeyId === 'dev') {
      new Logger('TemplateCipher').warn('используется ключ разработки шаблонов — задайте TEMPLATE_KEYS');
    }
  }

  private key(id: string): Buffer {
    const k = this.keys[id];
    if (!k) throw new Error(`ключ шаблонов «${id}» не задан в TEMPLATE_KEYS`);
    return k;
  }

  private static aad(userId: string, modelVersion: string, cancelable: boolean): Buffer {
    return Buffer.from(`${userId}|${modelVersion}|${cancelable ? 'p1' : 'p0'}`, 'utf8');
  }

  encrypt(userId: string, modelVersion: string, embedding: readonly number[]): EncryptedTemplate {
    const key = this.key(this.activeKeyId);
    const plain = this.cancelable
      ? project(orthogonalMatrix(key, userId, embedding.length), embedding)
      : embedding;
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', key, iv, { authTagLength: TAG_LEN });
    cipher.setAAD(AesGcmTemplateCipher.aad(userId, modelVersion, this.cancelable));
    const ciphertext = Buffer.concat([cipher.update(toBuffer(plain)), cipher.final(), cipher.getAuthTag()]);
    return { ciphertext, iv, keyId: this.activeKeyId, cancelable: this.cancelable };
  }

  decrypt(userId: string, modelVersion: string, t: EncryptedTemplate): number[] {
    const key = this.key(t.keyId);
    const body = t.ciphertext.subarray(0, t.ciphertext.length - TAG_LEN);
    const tag = t.ciphertext.subarray(t.ciphertext.length - TAG_LEN);
    const decipher = createDecipheriv('aes-256-gcm', key, t.iv, { authTagLength: TAG_LEN });
    decipher.setAAD(AesGcmTemplateCipher.aad(userId, modelVersion, t.cancelable));
    decipher.setAuthTag(tag);
    const plain = fromBuffer(Buffer.concat([decipher.update(body), decipher.final()]));
    return t.cancelable ? unproject(orthogonalMatrix(key, userId, plain.length), plain) : plain;
  }
}
