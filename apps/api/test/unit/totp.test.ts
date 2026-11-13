import { generateRecoveryCode, normalizeRecoveryCode } from '../../src/modules/mfa/domain/recovery-code';
import {
  base32Decode,
  base32Encode,
  hotp,
  otpauthUri,
  totpCounter,
  verifyTotp,
} from '../../src/modules/mfa/domain/totp';

// Секрет из приложения B RFC 4226 / RFC 6238: ASCII «12345678901234567890».
const SECRET = Buffer.from('12345678901234567890', 'ascii');

describe('HOTP / TOTP (RFC 4226, RFC 6238)', () => {
  it('HOTP: контрольные значения RFC 4226, приложение D', () => {
    const expected = [
      '755224',
      '287082',
      '359152',
      '969429',
      '338314',
      '254676',
      '287922',
      '162583',
      '399871',
      '520489',
    ];
    expected.forEach((code, counter) => expect(hotp(SECRET, counter)).toBe(code));
  });

  it('TOTP: контрольные значения RFC 6238 (SHA-1), младшие 6 цифр', () => {
    // 8-значные эталоны 94287082, 07081804, 14050471, 89005924, 69279037, 65353130 → хвост из 6 цифр.
    const cases: [number, string][] = [
      [59, '287082'],
      [1111111109, '081804'],
      [1111111111, '050471'],
      [1234567890, '005924'],
      [2000000000, '279037'],
      [20000000000, '353130'],
    ];
    for (const [t, code] of cases) expect(hotp(SECRET, totpCounter(t * 1000))).toBe(code);
  });

  it('verifyTotp принимает код в окне ±1 шаг и отвергает за его пределами', () => {
    const now = 1_700_000_000_000;
    const c = totpCounter(now);
    expect(verifyTotp(SECRET, hotp(SECRET, c), now)).toBe(c);
    expect(verifyTotp(SECRET, hotp(SECRET, c - 1), now)).toBe(c - 1);
    expect(verifyTotp(SECRET, hotp(SECRET, c + 1), now)).toBe(c + 1);
    expect(verifyTotp(SECRET, hotp(SECRET, c - 2), now)).toBeNull();
    expect(verifyTotp(SECRET, hotp(SECRET, c + 2), now)).toBeNull();
  });

  it('verifyTotp не принимает уже использованный шаг и мусор', () => {
    const now = 1_700_000_000_000;
    const c = totpCounter(now);
    const code = hotp(SECRET, c);
    expect(verifyTotp(SECRET, code, now, c)).toBeNull(); // повтор
    expect(verifyTotp(SECRET, code, now, c - 1)).toBe(c);
    for (const bad of ['', '12345', '1234567', 'abcdef', '12 456'])
      expect(verifyTotp(SECRET, bad, now)).toBeNull();
  });

  it('base32: круговое преобразование и допуск пробелов, дефисов и регистра', () => {
    expect(base32Encode(SECRET)).toBe('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'); // RFC 4648 / приложение к RFC 6238
    expect(base32Decode('gezd gnbv-GY3T QOJQ GEZDGNBVGY3TQOJQ').equals(SECRET)).toBe(true);
    expect(() => base32Decode('1!')).toThrow();
  });

  it('otpauth-ссылка содержит секрет, издателя и параметры', () => {
    const u = new URL(otpauthUri('BioAuth Optimizer', 'ivan@example.com', SECRET));
    expect(u.protocol).toBe('otpauth:');
    expect(u.hostname).toBe('totp');
    expect(decodeURIComponent(u.pathname)).toBe('/BioAuth Optimizer:ivan@example.com');
    expect(u.searchParams.get('secret')).toBe(base32Encode(SECRET));
    expect(u.searchParams.get('digits')).toBe('6');
    expect(u.searchParams.get('period')).toBe('30');
  });
});

describe('коды восстановления', () => {
  it('формат XXXXX-XXXXX без похожих символов; коды различаются', () => {
    const codes = new Set(Array.from({ length: 200 }, generateRecoveryCode));
    expect(codes.size).toBe(200);
    for (const c of codes)
      expect(c).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{5}$/);
  });

  it('нормализация: регистр, пробелы и дефис не важны', () => {
    expect(normalizeRecoveryCode(' k7m2p-9xq4t ')).toBe('K7M2P9XQ4T');
    expect(normalizeRecoveryCode('K7M2P 9XQ4T')).toBe('K7M2P9XQ4T');
  });
});
