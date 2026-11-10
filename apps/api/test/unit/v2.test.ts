import type { BioLivenessResponse, BioVerifyResponse, FaceStep } from '@bioauth/contracts';

import { chainHash, GENESIS_HASH } from '../../src/modules/audit/application/audit-log';
import type { FaceTemplateRepository, StoredTemplate } from '../../src/modules/biometrics/application/ports';
import { rekeyTemplates } from '../../src/modules/biometrics/application/rekey';
import { AesGcmTemplateCipher } from '../../src/modules/biometrics/infrastructure/aes-gcm-template-cipher';
import { orthogonalMatrix, project, unproject } from '../../src/modules/biometrics/infrastructure/projection';
import { ScryptPasswordHasher } from '../../src/modules/identity/infrastructure/scrypt-password-hasher';
import { ALL_COMMANDS, randomCommands } from '../../src/modules/verification/application/commands';
import { decideFace } from '../../src/modules/verification/application/face-decision';
import { type AppConfig, loadConfig } from '../../src/shared/config/env';

const STEP: FaceStep = { factor: 'face', tauFace: 0.4, tauPad: 0.5, commands: 3, calibrated: true };
const liveness = (over: Partial<BioLivenessResponse> = {}): BioLivenessResponse => ({
  pLiveMedian: 0.9,
  pLive: [0.9],
  commands: [
    { command: 'TURN_LEFT', passed: true, measure: 0.2, failure: null },
    { command: 'CHIN_UP', passed: true, measure: 0.8, failure: null },
  ],
  identityConsistent: true,
  minPairwiseSimilarity: 0.9,
  modelVersion: 'm',
  padVersion: 'p',
  ...over,
});
const verify = (score: number): BioVerifyResponse => ({
  score,
  scores: [score],
  consistency: 1,
  framesUsed: 1,
  probeEmbedding: new Array<number>(128).fill(0.1),
  modelVersion: 'm',
  frames: [],
});

describe('решение по лицу — правило «И» (docs/10 §10.5.4)', () => {
  const issued = ['TURN_LEFT', 'CHIN_UP'] as const;

  it('все условия выполнены — допуск', () => {
    expect(decideFace(STEP, issued, liveness(), verify(0.6))).toMatchObject({
      accepted: true,
      reason: null,
      challengesOk: true,
    });
  });

  it('граница порога включается: s = τ — допуск', () => {
    expect(decideFace(STEP, issued, liveness({ pLiveMedian: 0.5 }), verify(0.4)).accepted).toBe(true);
  });

  it.each([
    ['IDENTITY_SWITCH', liveness({ identityConsistent: false }), 0.9],
    [
      'LIVENESS_COMMANDS',
      liveness({ commands: [{ command: 'TURN_LEFT', passed: true, measure: 0.2, failure: null }] }),
      0.9,
    ],
    ['LIVENESS_PASSIVE', liveness({ pLiveMedian: 0.49 }), 0.9],
    ['NO_MATCH', liveness(), 0.39],
  ] as const)('отказ %s', (reason, l, score) => {
    const d = decideFace(STEP, issued, l, verify(score));
    expect(d).toMatchObject({ accepted: false, reason });
  });

  it('причина выбирается по важности: подмена лица важнее несовпадения', () => {
    expect(
      decideFace(STEP, issued, liveness({ identityConsistent: false, pLiveMedian: 0 }), verify(0)).reason,
    ).toBe('IDENTITY_SWITCH');
  });
});

describe('случайные команды', () => {
  it('различные, из допустимого набора, нужного числа', () => {
    for (let i = 0; i < 200; i++) {
      const c = randomCommands(3);
      expect(c).toHaveLength(3);
      expect(new Set(c).size).toBe(3);
      for (const x of c) expect(ALL_COMMANDS).toContain(x);
    }
    expect(randomCommands(0)).toEqual([]);
    expect(randomCommands(9)).toHaveLength(ALL_COMMANDS.length);
    expect(ALL_COMMANDS).toHaveLength(8);
  });

  it('встречаются все перестановки (распределение не вырождено)', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 20000; i++) seen.add(randomCommands(3).join());
    expect(seen.size).toBe(336); // 8·7·6
  });
});

describe('отменяемый шаблон и шифрование (ADR-0014)', () => {
  const key = Buffer.alloc(32, 3);
  const vec = Array.from({ length: 128 }, (_, i) => Math.sin(i + 1));
  const other = Array.from({ length: 128 }, (_, i) => Math.cos(3 * i));
  const dot = (a: number[], b: number[]) => a.reduce((s, x, i) => s + x * b[i]!, 0);

  it('проекция ортогональна: скалярные произведения сохраняются, обратная — транспонированная', () => {
    const p = orthogonalMatrix(key, 'user-1', 128);
    expect(dot(project(p, vec), project(p, other))).toBeCloseTo(dot(vec, other), 9);
    unproject(p, project(p, vec)).forEach((x, i) => expect(x).toBeCloseTo(vec[i]!, 9));
  });

  it('проекции разных субъектов и разных ключей различны (несвязываемость)', () => {
    const a = project(orthogonalMatrix(key, 'user-1', 128), vec);
    const b = project(orthogonalMatrix(key, 'user-2', 128), vec);
    const c = project(orthogonalMatrix(Buffer.alloc(32, 4), 'user-1', 128), vec);
    const norm = Math.sqrt(dot(vec, vec));
    expect(Math.abs(dot(a, b)) / norm ** 2).toBeLessThan(0.4);
    expect(Math.abs(dot(a, c)) / norm ** 2).toBeLessThan(0.4);
  });

  const config = (over: Record<string, string> = {}): AppConfig =>
    loadConfig({
      DATABASE_URL: 'postgresql://x',
      TEMPLATE_KEYS: JSON.stringify({
        k1: Buffer.alloc(32, 1).toString('base64'),
        k2: Buffer.alloc(32, 2).toString('base64'),
      }),
      TEMPLATE_ACTIVE_KEY: 'k1',
      ...over,
    });

  it('шифрование: расшифровка совпадает; подмена субъекта, модели или шифротекста — ошибка', () => {
    const cipher = new AesGcmTemplateCipher(config());
    const t = cipher.encrypt('u1', 'sface', vec);
    expect(t.keyId).toBe('k1');
    expect(t.iv).toHaveLength(12);
    cipher.decrypt('u1', 'sface', t).forEach((x, i) => expect(x).toBeCloseTo(vec[i]!, 9));
    expect(() => cipher.decrypt('u2', 'sface', t)).toThrow();
    expect(() => cipher.decrypt('u1', 'other-model', t)).toThrow();
    const tampered = Buffer.from(t.ciphertext);
    tampered[5]! ^= 1;
    expect(() => cipher.decrypt('u1', 'sface', { ...t, ciphertext: tampered })).toThrow();
    expect(cipher.encrypt('u1', 'sface', vec).iv.equals(t.iv)).toBe(false); // IV уникален
  });

  it('ротация ключей: старые шаблоны читаются по key_id после смены активного ключа', () => {
    const old = new AesGcmTemplateCipher(config()).encrypt('u1', 'sface', vec);
    const rotated = new AesGcmTemplateCipher(config({ TEMPLATE_ACTIVE_KEY: 'k2' }));
    expect(rotated.activeKeyId).toBe('k2');
    rotated.decrypt('u1', 'sface', old).forEach((x, i) => expect(x).toBeCloseTo(vec[i]!, 9));
  });

  it('ротация: шаблоны старого ключа перешифрованы активным, расшифровка совпадает', async () => {
    const oldCipher = new AesGcmTemplateCipher(config());
    const store = new Map<string, StoredTemplate>();
    for (const id of ['u1', 'u2'])
      store.set(id, {
        userId: id,
        modelVersion: 'sface',
        samples: 3,
        ...oldCipher.encrypt(id, 'sface', vec),
      });
    const repo = {
      all: () => [...store.values()],
      upsert: (t: StoredTemplate) => {
        store.set(t.userId, t);
        return Promise.resolve({ replaced: true });
      },
    } as unknown as FaceTemplateRepository;
    const next = new AesGcmTemplateCipher(config({ TEMPLATE_ACTIVE_KEY: 'k2' }));
    expect(await rekeyTemplates(repo, next)).toEqual({ checked: 2, rekeyed: 2 });
    expect(await rekeyTemplates(repo, next)).toEqual({ checked: 2, rekeyed: 0 });
    const t = store.get('u1')!;
    expect(t.keyId).toBe('k2');
    const only2 = new AesGcmTemplateCipher(
      loadConfig({
        DATABASE_URL: 'x',
        TEMPLATE_KEYS: JSON.stringify({ k2: Buffer.alloc(32, 2).toString('base64') }),
      }),
    );
    only2.decrypt('u1', 'sface', t).forEach((x, i) => expect(x).toBeCloseTo(vec[i]!, 9));
  });

  it('конфигурация: в production без TEMPLATE_KEYS процесс не стартует', () => {
    expect(() => loadConfig({ DATABASE_URL: 'postgresql://x', NODE_ENV: 'production' })).toThrow(
      /TEMPLATE_KEYS/,
    );
    expect(() => config({ TEMPLATE_ACTIVE_KEY: 'k9' })).toThrow(/TEMPLATE_ACTIVE_KEY/);
    expect(() => loadConfig({ DATABASE_URL: 'x', TEMPLATE_KEYS: '{"a":"c2hvcnQ="}' })).toThrow(/32 байта/);
  });
});

describe('журнал аудита: цепочка хэшей', () => {
  const e = {
    at: new Date('2026-11-04T10:00:00.000Z'),
    actorId: null,
    action: 'consent.granted',
    target: 'u',
    details: { v: 1 },
  };

  it('хэш зависит от предыдущего и от каждого поля события', () => {
    const h1 = chainHash(GENESIS_HASH, e);
    expect(h1).toMatch(/^[0-9a-f]{64}$/);
    expect(chainHash(GENESIS_HASH, e)).toBe(h1);
    expect(chainHash(h1, e)).not.toBe(h1);
    expect(chainHash(GENESIS_HASH, { ...e, details: { v: 2 } })).not.toBe(h1);
    expect(chainHash(GENESIS_HASH, { ...e, at: new Date('2026-11-04T10:00:00.001Z') })).not.toBe(h1);
  });
});

describe('пароли сотрудников (scrypt)', () => {
  it('проверка верного и неверного пароля, соль уникальна', async () => {
    const h = new ScryptPasswordHasher();
    const a = await h.hash('correct horse battery');
    expect(a).toMatch(/^scrypt\$32768\$8\$1\$/);
    await expect(h.verify('correct horse battery', a)).resolves.toBe(true);
    await expect(h.verify('wrong', a)).resolves.toBe(false);
    await expect(h.verify('x', 'garbage')).resolves.toBe(false);
    expect(await h.hash('correct horse battery')).not.toBe(a);
  });
});
