import {
  type FaceIssue,
  LIVENESS_GUIDE,
  type LivenessCommand,
  type PosePreviewDto,
} from '@bioauth/contracts';

export type PoseSample = PosePreviewDto;

export interface PoseBaseline {
  readonly yawRatio: number;
  readonly pitchRatio: number;
  readonly interocularPx: number;
  readonly rollDeg: number;
}

const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

/** Нейтральное положение — медиана поз с лицом (как Baseline в bio-engine). */
export function baselineOf(samples: readonly PoseSample[]): PoseBaseline | null {
  const ok = samples.filter(
    (s): s is PoseSample & { yawRatio: number; pitchRatio: number; interocularPx: number } =>
      s.face && s.yawRatio !== null && s.pitchRatio !== null && s.interocularPx !== null,
  );
  if (ok.length === 0) return null;
  return {
    yawRatio: median(ok.map((s) => s.yawRatio)),
    pitchRatio: median(ok.map((s) => s.pitchRatio)),
    interocularPx: median(ok.map((s) => s.interocularPx)),
    rollDeg: median(ok.map((s) => s.rollDeg ?? 0)),
  };
}

/**
 * Насколько выполнена команда: 1 — порог, который проверит сервер (LIVENESS_GUIDE), 0 — исходная поза.
 * null — лица нет. Формулы те же, что в bio-engine (app/domain/liveness.py, measure).
 */
export function commandProgress(cmd: LivenessCommand, base: PoseBaseline, pose: PoseSample): number | null {
  if (!pose.face || pose.yawRatio === null || pose.pitchRatio === null || pose.interocularPx === null)
    return null;
  switch (cmd) {
    case 'TURN_LEFT':
      return (pose.yawRatio - base.yawRatio) / LIVENESS_GUIDE.yawDelta;
    case 'TURN_RIGHT':
      return (base.yawRatio - pose.yawRatio) / LIVENESS_GUIDE.yawDelta;
    case 'CHIN_UP':
      return (1 - pose.pitchRatio / base.pitchRatio) / (1 - LIVENESS_GUIDE.pitchFactor);
    case 'CHIN_DOWN':
      return (pose.pitchRatio / base.pitchRatio - 1) / (LIVENESS_GUIDE.pitchDownFactor - 1);
    case 'TILT_LEFT':
      return ((pose.rollDeg ?? 0) - base.rollDeg) / LIVENESS_GUIDE.rollDeltaDeg;
    case 'TILT_RIGHT':
      return (base.rollDeg - (pose.rollDeg ?? 0)) / LIVENESS_GUIDE.rollDeltaDeg;
    case 'MOVE_CLOSER':
      return (pose.interocularPx / base.interocularPx - 1) / (LIVENESS_GUIDE.closerFactor - 1);
    case 'MOVE_AWAY':
      return (1 - pose.interocularPx / base.interocularPx) / (1 - LIVENESS_GUIDE.awayFactor);
  }
}

export type AlignHint = 'ok' | 'closer' | 'farther' | 'center' | 'straight' | FaceIssue;

const BLOCKING: readonly FaceIssue[] = ['MANY_FACES', 'TOO_DARK', 'TOO_BRIGHT', 'BLURRY'];

/** Совпадает ли лицо с контуром головы: размер, положение, фронтальность, качество. */
export function alignment(pose: PoseSample): AlignHint {
  if (!pose.face || !pose.box) return pose.issues.includes('MANY_FACES') ? 'MANY_FACES' : 'NO_FACE';
  const blocking = pose.issues.find((i) => BLOCKING.includes(i));
  if (blocking) return blocking;
  const [x, y, w, h] = pose.box;
  if (w < 0.24) return 'closer';
  if (w > 0.58) return 'farther';
  const cx = x + w / 2;
  const cy = y + h / 2;
  if (Math.abs(cx - 0.5) > 0.14 || cy < 0.3 || cy > 0.62) return 'center';
  if (pose.yawRatio !== null && Math.abs(pose.yawRatio) > 0.12) return 'straight';
  if (pose.rollDeg !== null && Math.abs(pose.rollDeg) > 8) return 'straight';
  return 'ok';
}
