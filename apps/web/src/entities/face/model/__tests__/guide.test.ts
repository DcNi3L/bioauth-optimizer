import { describe, expect, it } from 'vitest';

import { alignment, baselineOf, commandProgress, type PoseSample } from '../guide';

const pose = (o: Partial<PoseSample> = {}): PoseSample => ({
  face: true,
  issues: [],
  box: [0.33, 0.25, 0.34, 0.45],
  yawRatio: 0,
  pitchRatio: 1.6,
  interocularPx: 80,
  ...o,
});

describe('подсказки позы', () => {
  const base = baselineOf([pose(), pose({ yawRatio: 0.02 }), pose({ face: false, yawRatio: null })])!;

  it('нейтральная поза — медиана кадров с лицом', () => {
    expect(base).toEqual({ yawRatio: 0.01, pitchRatio: 1.6, interocularPx: 80 });
    expect(baselineOf([pose({ face: false, yawRatio: null })])).toBeNull();
  });

  it('прогресс команды: 1 — порог сервера, знак учитывает направление', () => {
    expect(commandProgress('TURN_LEFT', base, pose({ yawRatio: 0.11 }))).toBeCloseTo(1, 6);
    expect(commandProgress('TURN_RIGHT', base, pose({ yawRatio: 0.11 }))).toBeLessThan(0);
    expect(commandProgress('CHIN_UP', base, pose({ pitchRatio: 1.6 * 0.88 }))).toBeCloseTo(1, 6);
    expect(commandProgress('MOVE_CLOSER', base, pose({ interocularPx: 80 * 1.18 }))).toBeCloseTo(1, 6);
    expect(commandProgress('MOVE_CLOSER', base, pose({ face: false, interocularPx: null }))).toBeNull();
  });

  it('совмещение с контуром: размер, центр, поворот, качество', () => {
    expect(alignment(pose())).toBe('ok');
    expect(alignment(pose({ box: [0.4, 0.3, 0.15, 0.2] }))).toBe('closer');
    expect(alignment(pose({ box: [0.1, 0.05, 0.8, 0.9] }))).toBe('farther');
    expect(alignment(pose({ box: [0.0, 0.25, 0.3, 0.45] }))).toBe('center');
    expect(alignment(pose({ yawRatio: 0.2 }))).toBe('straight');
    expect(alignment(pose({ issues: ['TOO_DARK'] }))).toBe('TOO_DARK');
    expect(alignment(pose({ face: false, box: null }))).toBe('NO_FACE');
  });
});
