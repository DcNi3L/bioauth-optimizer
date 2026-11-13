import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/** TOTP по RFC 6238 (на основе HOTP, RFC 4226): HMAC-SHA1, 6 цифр, шаг 30 с — совместимо с Google Authenticator, Aegis, 1Password. */

export const TOTP_STEP_SECONDS = 30;
export const TOTP_DIGITS = 6;
/** Допустимое расхождение часов: ±1 шаг (±30 с). */
export const TOTP_WINDOW = 1;
const SECRET_BYTES = 20; // 160 бит, как рекомендует RFC 4226 §4

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const symbol = (i: number): string => ALPHABET.charAt(i);

export function base32Encode(data: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of data) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += symbol((value >>> (bits - 5)) & 31);
      bits -= 5;
    }
  }
  if (bits > 0) out += symbol((value << (5 - bits)) & 31);
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.replace(/[\s=-]/g, '').toUpperCase();
  const bytes: number[] = [];
  let bits = 0;
  let value = 0;
  for (const ch of clean) {
    const idx = ALPHABET.indexOf(ch);
    if (idx < 0) throw new Error('недопустимый символ base32');
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

export const generateTotpSecret = (): Buffer => randomBytes(SECRET_BYTES);

/** HOTP(K, C): динамическое усечение по RFC 4226 §5.3. */
export function hotp(secret: Buffer, counter: number, digits = TOTP_DIGITS): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac('sha1', secret).update(msg).digest();
  const offset = h[h.length - 1]! & 0x0f;
  const bin = ((h[offset]! & 0x7f) << 24) | (h[offset + 1]! << 16) | (h[offset + 2]! << 8) | h[offset + 3]!;
  return (bin % 10 ** digits).toString().padStart(digits, '0');
}

export const totpCounter = (nowMs: number, step = TOTP_STEP_SECONDS): number =>
  Math.floor(nowMs / 1000 / step);

const safeEqual = (a: string, b: string): boolean =>
  a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/**
 * Проверка кода в окне ±TOTP_WINDOW шагов. Возвращает шаг времени, на котором код совпал, либо null.
 * Шаг не больше `lastCounter` отвергается: один и тот же код нельзя использовать повторно.
 */
export function verifyTotp(
  secret: Buffer,
  code: string,
  nowMs: number,
  lastCounter = 0,
  window = TOTP_WINDOW,
): number | null {
  if (!/^\d{6}$/.test(code)) return null;
  const now = totpCounter(nowMs);
  let hit: number | null = null;
  // Перебираем всё окно без раннего выхода: время проверки не зависит от того, на каком шаге совпало.
  for (let c = now - window; c <= now + window; c++) {
    if (safeEqual(hotp(secret, c), code) && c > lastCounter) hit = c;
  }
  return hit;
}

/** Ссылка для QR-кода: https://github.com/google/google-authenticator/wiki/Key-Uri-Format */
export function otpauthUri(issuer: string, account: string, secret: Buffer): string {
  const label = `${encodeURIComponent(issuer)}:${encodeURIComponent(account)}`;
  const q = new URLSearchParams({
    secret: base32Encode(secret),
    issuer,
    algorithm: 'SHA1',
    digits: String(TOTP_DIGITS),
    period: String(TOTP_STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${q.toString()}`;
}
