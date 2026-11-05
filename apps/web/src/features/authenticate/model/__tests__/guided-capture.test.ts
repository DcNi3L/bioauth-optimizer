import type { LivenessCommand } from '@bioauth/contracts';
import { describe, expect, it } from 'vitest';

import type { PoseSample } from '@/entities/face';

import { type CaptureDeps, guidedCapture, type GuideState } from '../guided-capture';

const neutral: PoseSample = {
  face: true,
  issues: [],
  box: [0.33, 0.25, 0.34, 0.45],
  yawRatio: 0,
  pitchRatio: 1.6,
  interocularPx: 80,
};

/** Сценарий: поза зависит от того, какую команду пользователь сейчас выполняет и сколько кадров прошло. */
function deps(perform: (cmd: LivenessCommand | null, tick: number) => Partial<PoseSample>) {
  let t = 0;
  let tick = 0;
  let current: LivenessCommand | null = null;
  const states: GuideState[] = [];
  const d: CaptureDeps = {
    grab: () => ({
      full: { image: `f${tick}`, ts: 1000 + tick * 10 },
      small: { image: 's', width: 320, height: 240 },
    }),
    pose: () => Promise.resolve({ ...neutral, ...perform(current, tick++) }),
    sleep: (ms) => {
      t += ms;
      return Promise.resolve();
    },
    now: () => (t += 50),
    onUpdate: (s) => {
      current = s.phase === 'command' ? s.command : null;
      states.push(s);
    },
  };
  return { d, states };
}

describe('управляемая съёмка', () => {
  it('ждёт выполнения команды и отправляет кадры с моментом выполнения', async () => {
    const { d, states } = deps((cmd) =>
      cmd === 'TURN_LEFT' ? { yawRatio: 0.2 } : cmd === 'MOVE_CLOSER' ? { interocularPx: 110 } : {},
    );
    const body = await guidedCapture(['TURN_LEFT', 'MOVE_CLOSER'], d);
    expect(body.baseline).toHaveLength(3);
    expect(body.steps.map((s) => s.command)).toEqual(['TURN_LEFT', 'MOVE_CLOSER']);
    expect(body.steps.every((s) => s.frames.length === 4)).toBe(true);
    // Метки времени кадров шага строго возрастают — так их проверяет bio-engine.
    for (const s of body.steps) {
      const ts = s.frames.map((f) => f.ts);
      expect(ts).toEqual([...ts].sort((a, b) => a - b));
    }
    expect(states.some((s) => s.hint === 'done')).toBe(true);
    expect(states.at(-1)!.phase).toBe('checking');
  });

  it('если команда не выполнена — по истечении времени отправляет лучшие кадры', async () => {
    const { d, states } = deps((cmd, tick) =>
      cmd === 'CHIN_UP' ? { pitchRatio: 1.6 - (tick % 3) * 0.05 } : {},
    );
    const body = await guidedCapture(['CHIN_UP'], d, {
      alignMs: 500,
      stepMs: 1500,
      target: 1.25,
      pollMs: 100,
    });
    expect(body.steps[0]!.frames.length).toBeGreaterThanOrEqual(2);
    expect(states.some((s) => s.hint === 'timeout')).toBe(true);
  });

  it('при четырёх командах укладывается в 16 кадров на запрос', async () => {
    const { d } = deps((cmd) =>
      cmd ? { yawRatio: cmd === 'TURN_LEFT' ? 0.3 : -0.3, pitchRatio: 1.2, interocularPx: 120 } : {},
    );
    const body = await guidedCapture(['TURN_LEFT', 'TURN_RIGHT', 'CHIN_UP', 'MOVE_CLOSER'], d);
    const n = body.baseline.length + body.steps.reduce((a, s) => a + s.frames.length, 0);
    expect(n).toBeLessThanOrEqual(16);
  });
});
