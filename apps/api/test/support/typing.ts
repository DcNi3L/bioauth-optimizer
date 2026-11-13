/** Синтетический «почерк» для проверки динамики набора: личные средние и шум повторов. */
export const PHRASE = 'the quick brown fox';

export interface KeyEvent {
  code: string;
  down: number;
  up: number;
}

export function rng(seed: number) {
  let s = seed >>> 0;
  const u = () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) + 0.5) / 4294967296;
  return () => Math.sqrt(-2 * Math.log(u())) * Math.cos(2 * Math.PI * u());
}

const codes = (PHRASE.match(/./g) ?? []).map((c) => (c === ' ' ? 'Space' : `Key${c.toUpperCase()}`));

export interface Profile {
  hold: number[];
  dd: number[];
}

export function profile(seed: number): Profile {
  const n = rng(seed);
  return {
    hold: codes.map(() => Math.max(45, 95 + 20 * n())),
    dd: codes.slice(1).map(() => Math.max(80, 190 + 55 * n())),
  };
}

export function typing(p: Profile, n: () => number): { events: KeyEvent[] } {
  const tempo = 1 + 0.1 * n();
  let t = 1000;
  return {
    events: codes.map((code, i) => {
      const down = t;
      const h = p.hold[i]! * tempo * (1 + 0.2 * n());
      if (i < p.dd.length) t += p.dd[i]! * tempo * (1 + 0.2 * n());
      return { code, down, up: down + Math.max(20, h) };
    }),
  };
}
