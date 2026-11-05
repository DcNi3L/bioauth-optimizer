import {
  createHash,
  createPublicKey,
  createSign,
  createVerify,
  type KeyObject,
  timingSafeEqual,
} from 'node:crypto';

/** Минимальная реализация JWS RS256 (RFC 7515/7518) на node:crypto — без внешних зависимостей. */

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');

export function signJwt(payload: Record<string, unknown>, key: KeyObject, kid: string, typ = 'JWT'): string {
  const header = b64url(JSON.stringify({ alg: 'RS256', typ, kid }));
  const body = b64url(JSON.stringify(payload));
  const sig = createSign('RSA-SHA256').update(`${header}.${body}`).sign(key);
  return `${header}.${body}.${b64url(sig)}`;
}

export interface DecodedJwt {
  header: { alg?: string; kid?: string; typ?: string };
  payload: Record<string, unknown>;
}

export function decodeJwt(token: string): DecodedJwt | null {
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  try {
    return {
      header: JSON.parse(Buffer.from(parts[0]!, 'base64url').toString('utf8')) as DecodedJwt['header'],
      payload: JSON.parse(Buffer.from(parts[1]!, 'base64url').toString('utf8')) as Record<string, unknown>,
    };
  } catch {
    return null;
  }
}

/** Проверка подписи и срока; ключ выбирается по kid. null — токен недействителен. */
export function verifyJwt(
  token: string,
  keys: (kid: string) => KeyObject | null,
  now = Date.now(),
): DecodedJwt | null {
  const d = decodeJwt(token);
  if (d?.header.alg !== 'RS256' || typeof d.header.kid !== 'string') return null;
  const key = keys(d.header.kid);
  if (!key) return null;
  const [h, p, s] = token.split('.') as [string, string, string];
  const ok = createVerify('RSA-SHA256').update(`${h}.${p}`).verify(key, Buffer.from(s, 'base64url'));
  if (!ok) return null;
  const exp = d.payload.exp;
  if (typeof exp !== 'number' || exp * 1000 <= now) return null;
  return d;
}

export const publicKeyFromJwk = (jwk: Record<string, unknown>): KeyObject =>
  createPublicKey({ key: jwk, format: 'jwk' });

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');

/** PKCE S256 (RFC 7636): BASE64URL(SHA256(verifier)) == challenge, сравнение за постоянное время. */
export function pkceMatches(verifier: string, challenge: string): boolean {
  if (!/^[A-Za-z0-9._~-]{43,128}$/.test(verifier)) return false;
  const computed = Buffer.from(createHash('sha256').update(verifier).digest('base64url'));
  const expected = Buffer.from(challenge);
  return computed.length === expected.length && timingSafeEqual(computed, expected);
}

export function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex');
  const y = Buffer.from(b, 'hex');
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}
