import { describe, expect, it } from 'vitest';

import { RhythmRecorder } from './recorder';

const base = { repeat: false, shiftKey: false, ctrlKey: false, altKey: false, metaKey: false };

function type(r: RhythmRecorder, phrase: string, step = 150, hold = 90) {
  let t = 100;
  for (const ch of phrase) {
    const code = ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`;
    expect(r.keyDown({ ...base, code, timeStamp: t }).kind).toBe('ok');
    r.keyUp({ code, timeStamp: t + hold });
    t += step;
  }
}

describe('RhythmRecorder', () => {
  it('записывает время нажатия и отпускания относительно первой клавиши', () => {
    const r = new RhythmRecorder('ab c');
    type(r, 'ab c');
    const s = r.complete()!;
    expect(s.events.map((e) => e.code)).toEqual(['KeyA', 'KeyB', 'Space', 'KeyC']);
    expect(s.events[0]).toEqual({ code: 'KeyA', down: 0, up: 90 });
    expect(s.events[3]!.down).toBe(450);
  });

  it('неверная клавиша, Shift и лишние символы сбрасывают повтор', () => {
    const r = new RhythmRecorder('ab');
    expect(r.keyDown({ ...base, code: 'KeyA', timeStamp: 1 }).kind).toBe('ok');
    expect(r.keyDown({ ...base, code: 'KeyZ', timeStamp: 2 }).kind).toBe('wrong');
    expect(r.typed).toBe(0);
    expect(r.keyDown({ ...base, code: 'KeyA', timeStamp: 3, shiftKey: true }).kind).toBe('wrong');
    expect(r.keyDown({ ...base, code: 'Backspace', timeStamp: 4 }).kind).toBe('wrong');
    type(r, 'ab');
    expect(r.keyDown({ ...base, code: 'KeyC', timeStamp: 999 }).kind).toBe('wrong');
  });

  it('автоповтор и служебные клавиши игнорируются; без отпускания ввод не завершён', () => {
    const r = new RhythmRecorder('ab');
    r.keyDown({ ...base, code: 'KeyA', timeStamp: 1 });
    expect(r.keyDown({ ...base, code: 'KeyA', timeStamp: 2, repeat: true }).kind).toBe('ignored');
    expect(r.keyDown({ ...base, code: 'Tab', timeStamp: 3 }).kind).toBe('ignored');
    r.keyDown({ ...base, code: 'KeyB', timeStamp: 100 });
    r.keyUp({ code: 'KeyA', timeStamp: 120 });
    expect(r.complete()).toBeNull();
    r.keyUp({ code: 'KeyB', timeStamp: 190 });
    expect(r.complete()).not.toBeNull();
  });

  it('перекрывающиеся нажатия (быстрый набор) записываются корректно', () => {
    const r = new RhythmRecorder('ab');
    r.keyDown({ ...base, code: 'KeyA', timeStamp: 0 });
    r.keyDown({ ...base, code: 'KeyB', timeStamp: 60 });
    r.keyUp({ code: 'KeyA', timeStamp: 90 });
    r.keyUp({ code: 'KeyB', timeStamp: 140 });
    expect(r.complete()!.events).toEqual([
      { code: 'KeyA', down: 0, up: 90 },
      { code: 'KeyB', down: 60, up: 140 },
    ]);
  });
});
