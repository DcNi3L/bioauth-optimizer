import {
  buildTemplate,
  CLIP,
  consistency,
  DEFAULT_THRESHOLD,
  distance,
  expectedCodes,
  extractFeatures,
  type KeyEventLike,
  parseTemplate,
  SampleError,
  scoreOf,
  serializeTemplate,
} from '../../src/modules/keystroke/domain/keystroke';

const PHRASE = 'the quick brown fox';

/** Детерминированный генератор: LCG + Бокс — Мюллер. */
function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

interface Profile {
  hold: number[];
  dd: number[];
}

/** Личный почерк: удержания ≈ 95 ± 20 мс, интервалы ≈ 190 ± 55 мс. */
function profile(seed: number): Profile {
  const n = rng(seed);
  const len = expectedCodes(PHRASE).length;
  return {
    hold: Array.from({ length: len }, () => Math.max(45, 95 + 20 * n())),
    dd: Array.from({ length: len - 1 }, () => Math.max(80, 190 + 55 * n())),
  };
}

/** Один ввод: у каждого признака шум 20 %, плюс общий темп дня ±10 %. */
function type(p: Profile, n: () => number): KeyEventLike[] {
  const tempo = 1 + 0.1 * n();
  const codes = expectedCodes(PHRASE);
  let t = 1000;
  return codes.map((code, i) => {
    const down = t;
    const h = p.hold[i]! * tempo * (1 + 0.2 * n());
    if (i < p.dd.length) t += p.dd[i]! * tempo * (1 + 0.2 * n());
    return { code, down, up: down + Math.max(20, h) };
  });
}

describe('динамика набора: признаки', () => {
  it('вектор — n удержаний и n−1 интервалов', () => {
    const ev = type(profile(1), rng(2));
    const x = extractFeatures(ev, PHRASE);
    expect(x).toHaveLength(ev.length + ev.length - 1);
    expect(x[0]).toBeCloseTo(ev[0]!.up - ev[0]!.down);
    expect(x[ev.length]).toBeCloseTo(ev[1]!.down - ev[0]!.down);
  });

  it('отклоняет чужую фразу, неполный ввод, невозможные и «роботизированные» времена', () => {
    const ev = type(profile(1), rng(2));
    expect(() => extractFeatures(ev.slice(0, -1), PHRASE)).toThrow(SampleError);
    expect(() =>
      extractFeatures(
        ev.map((e, i) => (i === 3 ? { ...e, code: 'KeyZ' } : e)),
        PHRASE,
      ),
    ).toThrow(/не та фраза/);
    expect(() =>
      extractFeatures(
        ev.map((e) => ({ ...e, up: e.down + 1 })),
        PHRASE,
      ),
    ).toThrow(/удержания/);
    const robot = ev.map((e, i) => ({ code: e.code, down: 1000 + i * 100, up: 1000 + i * 100 + 50 }));
    expect(() => extractFeatures(robot, PHRASE)).toThrow(/слишком ровный/);
    expect(() =>
      extractFeatures(
        ev.map((e, i) => ({ ...e, down: 1000 + i * 5, up: 1000 + i * 5 + 40 })),
        PHRASE,
      ),
    ).toThrow(SampleError);
  });

  it('поддерживает только строчные латинские буквы и пробелы', () => {
    expect(expectedCodes('a b')).toEqual(['KeyA', 'Space', 'KeyB']);
    expect(() => expectedCodes('Привет')).toThrow();
  });
});

describe('динамика набора: шаблон и расстояние', () => {
  it('шаблон сериализуется без потерь', () => {
    const n = rng(5);
    const p = profile(5);
    const t = buildTemplate(Array.from({ length: 5 }, () => extractFeatures(type(p, n), PHRASE)));
    expect(parseTemplate(serializeTemplate(t))).toEqual(t);
    expect(() => parseTemplate(Buffer.from('{"mean":[1],"std":[1,2]}'))).toThrow();
  });

  it('расстояние: 0 в среднем шаблона, отсечка CLIP, нужная размерность', () => {
    const t = { mean: [100, 200], std: [10, 20] };
    expect(distance(t, [100, 200])).toBe(0);
    expect(distance(t, [110, 220])).toBeCloseTo(1);
    expect(distance(t, [10_000, 10_000])).toBe(CLIP);
    expect(() => distance(t, [1])).toThrow();
    expect(scoreOf(0)).toBe(1);
    expect(scoreOf(CLIP)).toBe(0);
  });

  it('синтетическая модель: порог по умолчанию даёт FAR ≈ 1–2 % и FRR ≈ 10 %', () => {
    const users = 40;
    const n = rng(99);
    const profiles = Array.from({ length: users }, (_, i) => profile(1000 + i));
    const templates = profiles.map((p) =>
      buildTemplate(Array.from({ length: 5 }, () => extractFeatures(type(p, n), PHRASE))),
    );
    let frrBad = 0;
    let frrAll = 0;
    let farBad = 0;
    let farAll = 0;
    for (let u = 0; u < users; u++) {
      for (let k = 0; k < 20; k++) {
        frrAll++;
        if (distance(templates[u]!, extractFeatures(type(profiles[u]!, n), PHRASE)) > DEFAULT_THRESHOLD)
          frrBad++;
      }
      for (let v = 0; v < users; v++) {
        if (v === u) continue;
        farAll++;
        if (distance(templates[u]!, extractFeatures(type(profiles[v]!, n), PHRASE)) <= DEFAULT_THRESHOLD)
          farBad++;
      }
    }
    const frr = frrBad / frrAll;
    const far = farBad / farAll;
    // Это проверка реализации на модели, а не оценка точности на людях.
    expect(far).toBeLessThan(0.04);
    expect(frr).toBeLessThan(0.16);
  });

  it('согласованность повторов: у стабильного почерка ниже, чем у шумного', () => {
    const n = rng(7);
    const p = profile(7);
    const calm = Array.from({ length: 5 }, () => extractFeatures(type(p, n), PHRASE));
    const noisy = Array.from({ length: 5 }, () =>
      extractFeatures(
        type(p, () => Math.max(-2, Math.min(2, 2 * n()))),
        PHRASE,
      ).map((v) => Math.max(1, v)),
    );
    expect(consistency(buildTemplate(calm), calm)).toBeLessThan(consistency(buildTemplate(noisy), noisy));
  });
});
