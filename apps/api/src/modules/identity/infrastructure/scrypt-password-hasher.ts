import { randomBytes, scrypt, type ScryptOptions, timingSafeEqual } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import type { PasswordHasher } from '../application/ports';

const PARAMS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } satisfies ScryptOptions;
const KEY_LEN = 32;

function derive(password: string, salt: Buffer, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFKC'), salt, KEY_LEN, opts, (err, key) => (err ? reject(err) : resolve(key)));
  });
}

/**
 * Пароли сотрудников — scrypt (рекомендован OWASP; встроен в Node.js, без нативных зависимостей).
 * Формат: scrypt$N$r$p$соль$хэш (base64url) — параметры хранятся рядом, их можно усилить позже.
 */
@Injectable()
export class ScryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    const salt = randomBytes(16);
    const key = await derive(password, salt, PARAMS);
    return [
      'scrypt',
      PARAMS.N,
      PARAMS.r,
      PARAMS.p,
      salt.toString('base64url'),
      key.toString('base64url'),
    ].join('$');
  }

  async verify(password: string, stored: string): Promise<boolean> {
    const [alg, n, r, p, salt, hash] = stored.split('$');
    if (alg !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
    const expected = Buffer.from(hash, 'base64url');
    const key = await derive(password, Buffer.from(salt, 'base64url'), {
      N: Number(n),
      r: Number(r),
      p: Number(p),
      maxmem: PARAMS.maxmem,
    });
    return key.length === expected.length && timingSafeEqual(key, expected);
  }
}
