import { inflateSync } from 'node:zlib';

import { keystrokeScores } from '../../src/modules/calibration/application/keystroke-batch.service';
import { confirmedRate, farTargetThreshold } from '../../src/modules/calibration/application/stats';
import {
  parseCmuKeystroke,
  pgmToPng,
  storedZip,
} from '../../src/modules/calibration/infrastructure/open-datasets';
import { profile, rng, typing } from '../support/typing';

describe('полная калибровка: форматы открытых наборов', () => {
  it('PGM P5 → PNG в градациях серого с теми же пикселями', () => {
    const [w, h] = [3, 2];
    const px = Buffer.from([0, 64, 128, 192, 255, 7]);
    const png = pgmToPng(Buffer.concat([Buffer.from(`P5\n# comment\n${w} ${h}\n255\n`, 'latin1'), px]));
    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
    expect(png.readUInt32BE(16)).toBe(w);
    expect(png.readUInt32BE(20)).toBe(h);
    expect(png[25]).toBe(0); // цветовой тип «градации серого»
    const idat = png.indexOf('IDAT');
    const raw = inflateSync(png.subarray(idat + 4, idat + 4 + png.readUInt32BE(idat - 4)));
    expect(raw).toEqual(Buffer.from([0, 0, 64, 128, 0, 192, 255, 7]));
    expect(() => pgmToPng(Buffer.from('P2 1 1 255 0'))).toThrow(/PGM/);
  });

  it('zip без сжатия: подписи, число записей, имена и данные на своих местах', () => {
    const entries = [
      { path: 's01/1.png', data: Buffer.from('один') },
      { path: 's02/1.png', data: Buffer.from('два-два') },
    ];
    const zip = storedZip(entries);
    expect(zip.readUInt32LE(0)).toBe(0x04034b50);
    const eocd = zip.length - 22;
    expect(zip.readUInt32LE(eocd)).toBe(0x06054b50);
    expect(zip.readUInt16LE(eocd + 10)).toBe(2);
    let at = 0;
    for (const e of entries) {
      const nameLen = zip.readUInt16LE(at + 26);
      expect(zip.toString('utf8', at + 30, at + 30 + nameLen)).toBe(e.path);
      const size = zip.readUInt32LE(at + 22);
      expect(zip.subarray(at + 30 + nameLen, at + 30 + nameLen + size)).toEqual(e.data);
      at += 30 + nameLen + size;
    }
    expect(zip.readUInt32LE(eocd + 16)).toBe(at); // центральный каталог сразу после записей
  });

  it('CSV CMU: H и DD в миллисекундах, повторы сгруппированы по людям; UD и битые строки — нет', () => {
    const csv = [
      'subject,sessionIndex,rep,H.a,DD.a.b,UD.a.b,H.b',
      's002,1,1,0.1,0.2,0.1,0.12',
      's002,1,2,0.11,0.21,0.1,0.13',
      's003,1,1,0.09,NA,0.1,0.1',
      's003,1,2,0.08,0.3,0.22,0.1',
    ].join('\n');
    const subjects = parseCmuKeystroke(csv);
    expect(subjects.map((s) => s.id)).toEqual(['s002', 's003']);
    expect(subjects[0]!.vectors[0]).toEqual([100, 120, 200]);
    expect(subjects[1]!.vectors).toHaveLength(1);
    expect(() => parseCmuKeystroke('a,b\n1,2')).toThrow(/формат/);
  });
});

describe('пакетная оценка ритма набора', () => {
  const people = Array.from({ length: 6 }, (_, k) => {
    const p = profile(100 + k);
    const n = rng(500 + k);
    return {
      id: `p${k}`,
      vectors: Array.from({ length: 30 }, () => {
        const ev = typing(p, n).events;
        return [...ev.map((e) => e.up - e.down), ...ev.slice(1).map((e, i) => e.down - ev[i]!.down)];
      }),
    };
  });

  it('протокол пар: число оценок, оценки в [0, 1], свои вводы ближе чужих', () => {
    const r = keystrokeScores(people, { enroll: 5, stride: 5, impostorPerSubject: 5 });
    expect(r.subjects).toBe(6);
    expect(r.genuine).toHaveLength(6 * 5); // (30 − 5) / 5
    expect(r.impostor).toHaveLength(6 * 5 * 5);
    for (const s of [...r.genuine, ...r.impostor]) expect(s).toBeGreaterThanOrEqual(0);
    const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
    expect(mean(r.genuine)).toBeGreaterThan(mean(r.impostor) + 0.1);
  });

  it('один человек или разная размерность признаков — ошибка, а не тихий результат', () => {
    expect(() => keystrokeScores(people.slice(0, 1))).toThrow(/двух/);
    const broken = [people[0]!, { id: 'x', vectors: people[1]!.vectors.map((v) => v.slice(1)) }];
    expect(() => keystrokeScores(broken)).toThrow(/признаков/);
  });
});

describe('порог по целевому FAR (открытые наборы)', () => {
  it('наименьший τ, при котором верхняя 95%-граница FAR не выше цели', () => {
    // 20 000 злоумышленников 0…0,39998: граница Уилсона допускает несколько ложных допусков при FAR ≤ 1e-3.
    const neg = Array.from({ length: 20_000 }, (_, i) => i / 50_000);
    const tau = farTargetThreshold(neg, 1e-3)!;
    const fa = neg.filter((s) => s >= tau).length;
    expect(confirmedRate(fa, neg.length)).toBeLessThanOrEqual(1e-3);
    // На шаг округления (1e-4) ниже — цель уже не подтверждается.
    const below = neg.filter((s) => s >= tau - 1e-4).length;
    expect(confirmedRate(below, neg.length)).toBeGreaterThan(1e-3);
    expect(fa).toBeGreaterThan(0);
    expect(tau).toBeLessThan(0.4);
    // При 4000 сравнениях допустим только ноль ложных допусков: τ — сразу над наибольшей оценкой.
    expect(farTargetThreshold(neg.slice(-4000), 1e-3)).toBe(0.4);
  });

  it('сравнений мало, чтобы подтвердить цель, — null', () => {
    expect(farTargetThreshold([0.1, 0.2, 0.3], 1e-3)).toBeNull();
  });
});
