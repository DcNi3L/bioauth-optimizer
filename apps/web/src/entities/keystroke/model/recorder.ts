import type { KeyEvent } from '@bioauth/contracts';

/** Что произошло после нажатия клавиши. */
export type RecorderResult =
  | { kind: 'ok' }
  | { kind: 'wrong' } // не та клавиша, модификатор или Backspace: повтор начинается заново
  | { kind: 'ignored' }; // автоповтор и вспомогательные клавиши

export function expectedCode(ch: string): string {
  return ch === ' ' ? 'Space' : `Key${ch.toUpperCase()}`;
}

/**
 * Запись одного ввода фразы: порядок клавиш, нажатие и отпускание. Время берётся из события
 * (DOMHighResTimeStamp), а не из Date.now: разрешение — доли миллисекунды и нет скачков системных часов.
 */
export class RhythmRecorder {
  private readonly events: { code: string; down: number; up: number | null }[] = [];

  constructor(private readonly phrase: string) {}

  get typed(): number {
    return this.events.length;
  }

  reset(): void {
    this.events.length = 0;
  }

  keyDown(e: {
    code: string;
    timeStamp: number;
    repeat: boolean;
    shiftKey: boolean;
    ctrlKey: boolean;
    altKey: boolean;
    metaKey: boolean;
  }): RecorderResult {
    if (e.repeat) return { kind: 'ignored' };
    if (['Tab', 'Enter', 'Escape'].includes(e.code)) return { kind: 'ignored' };
    const next = this.phrase.charAt(this.events.length);
    const wrong =
      e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || next === '' || e.code !== expectedCode(next);
    if (wrong) {
      this.reset();
      return { kind: 'wrong' };
    }
    this.events.push({ code: e.code, down: e.timeStamp, up: null });
    return { kind: 'ok' };
  }

  keyUp(e: { code: string; timeStamp: number }): void {
    const ev = this.events.find((x) => x.code === e.code && x.up === null);
    if (ev) ev.up = e.timeStamp;
  }

  /** Полный ввод готов, когда набраны все клавиши и все отпущены. */
  complete(): { events: KeyEvent[] } | null {
    if (this.events.length !== this.phrase.length || this.events.some((x) => x.up === null)) return null;
    const t0 = this.events[0]!.down;
    return {
      events: this.events.map((x) => ({
        code: x.code,
        down: Math.round((x.down - t0) * 100) / 100,
        up: Math.round((x.up! - t0) * 100) / 100,
      })),
    };
  }
}
