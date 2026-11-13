import { describe, expect, it } from 'vitest';

import { GAP_MS, INITIAL_GATE, nextGate, pickVoice, REPEAT_MS, STABLE_MS } from '../speech/speech-queue';

function run(seq: [string | null, number][]) {
  let g = INITIAL_GATE;
  const said: string[] = [];
  for (const [text, at] of seq) {
    const r = nextGate(g, text, at);
    g = r.gate;
    if (r.say) said.push(r.say);
  }
  return said;
}

describe('озвучка подсказок', () => {
  it('подсказка озвучивается, только когда продержалась', () => {
    expect(run([['Поверните голову влево', 0]])).toEqual([]);
    expect(
      run([
        ['Поверните голову влево', 0],
        ['Поверните голову влево', STABLE_MS],
      ]),
    ).toEqual(['Поверните голову влево']);
  });

  it('мелькающие подсказки не озвучиваются', () => {
    const seq: [string, number][] = [];
    for (let i = 0; i < 20; i++) seq.push([i % 2 ? 'Ближе' : 'Дальше', i * 100]);
    expect(run(seq)).toEqual([]);
  });

  it('та же фраза не повторяется чаще REPEAT_MS, разные — с паузой GAP_MS', () => {
    const a = 'Влево';
    const b = 'Вправо';
    expect(
      run([
        [a, 0],
        [a, 400],
        [a, 1000],
        [a, 400 + REPEAT_MS],
      ]),
    ).toEqual([a, a]);
    expect(
      run([
        [a, 0],
        [a, 400],
        [b, 500],
        [b, 900],
        [b, 400 + GAP_MS],
      ]),
    ).toEqual([a, b]);
  });

  it('выбор голоса: точный язык, затем по основе; казахского может не быть', () => {
    const voices = [
      { lang: 'en-GB', localService: true },
      { lang: 'ru_RU', localService: false },
      { lang: 'en-US', localService: true },
    ];
    expect(pickVoice(voices, 'en')).toBe(voices[2]);
    expect(pickVoice(voices, 'ru')).toBe(voices[1]);
    expect(pickVoice(voices, 'kk')).toBeNull();
  });
});
