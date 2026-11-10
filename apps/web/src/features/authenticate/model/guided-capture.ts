import type { CaptureFrame, LivenessCommand, SubmitFaceRequest } from '@bioauth/contracts';

import {
  type AlignHint,
  alignment,
  baselineOf,
  commandProgress,
  type PoseBaseline,
  type PoseSample,
} from '@/entities/face';

export interface SmallFrame {
  readonly image: string;
  readonly width: number;
  readonly height: number;
}

export interface CaptureDeps {
  /** Один и тот же момент видео: кадр для проверки и уменьшенный — для подсказки. */
  grab(): { full: CaptureFrame & { ts: number }; small: SmallFrame };
  pose(frame: SmallFrame): Promise<PoseSample>;
  sleep(ms: number): Promise<void>;
  now(): number;
  onUpdate(state: GuideState): void;
  /** Остановка съёмки пользователем: ближайший кадр прерывает её ошибкой CaptureAborted. */
  signal?: AbortSignal;
}

export class CaptureAborted extends Error {
  override name = 'CaptureAborted';
}

export type GuidePhase = 'align' | 'baseline' | 'command' | 'return' | 'checking';

export interface GuideState {
  readonly phase: GuidePhase;
  readonly command: LivenessCommand | null;
  readonly stepIndex: number;
  readonly total: number;
  /** Выполнение текущей команды, 0…1 (1 — с запасом над порогом сервера). */
  readonly progress: number;
  readonly hint: AlignHint | 'hold' | 'more' | 'done' | 'timeout' | null;
  readonly box: PoseSample['box'];
  /** Общий ход попытки, 0…1. */
  readonly overall: number;
}

export interface CaptureOptions {
  readonly alignMs: number;
  readonly stepMs: number;
  /** Во сколько раз превысить порог сервера, чтобы засчитать команду в интерфейсе. */
  readonly target: number;
  readonly pollMs: number;
}

export const DEFAULT_CAPTURE: CaptureOptions = { alignMs: 7000, stepMs: 9000, target: 1.25, pollMs: 120 };

const BASELINE_FRAMES = 3;
const MAX_FRAMES = 16; // предел bio-engine на запрос

interface Sample {
  frame: CaptureFrame & { ts: number };
  pose: PoseSample;
  progress: number;
}

/**
 * Управляемая съёмка попытки входа: сервер возвращает геометрию каждого кадра, интерфейс показывает,
 * насколько выполнена команда, и снимает кадры, пока движение не достигнет порога с запасом.
 * Решение принимает сервер по отправленным кадрам — здесь только подсказки и выбор момента.
 */
export async function guidedCapture(
  commands: readonly LivenessCommand[],
  deps: CaptureDeps,
  opts: CaptureOptions = DEFAULT_CAPTURE,
): Promise<SubmitFaceRequest> {
  const total = commands.length;
  const perStep = Math.max(2, Math.min(4, Math.floor((MAX_FRAMES - BASELINE_FRAMES) / Math.max(1, total))));
  const units = 1 + total;
  const emit = (s: Omit<GuideState, 'total'>) => deps.onUpdate({ ...s, total });

  const sample = async () => {
    if (deps.signal?.aborted) throw new CaptureAborted('съёмка остановлена');
    const { full, small } = deps.grab();
    const pose = await deps.pose(small);
    return { frame: full, pose };
  };

  // 1. Совмещение с контуром головы (не дольше alignMs: дальше решает сервер).
  const alignStart = deps.now();
  let okStreak = 0;
  const neutral: PoseSample[] = [];
  while (deps.now() - alignStart < opts.alignMs) {
    const { pose } = await sample();
    const hint = alignment(pose);
    okStreak = hint === 'ok' ? okStreak + 1 : 0;
    if (hint === 'ok') neutral.push(pose);
    emit({
      phase: 'align',
      command: null,
      stepIndex: 0,
      progress: Math.min(1, okStreak / 2),
      hint: okStreak ? 'hold' : hint,
      box: pose.box,
      overall: 0,
    });
    if (okStreak >= 2) break;
    await deps.sleep(opts.pollMs);
  }

  // 2. Нейтральные кадры.
  const baselineFrames: CaptureFrame[] = [];
  for (let i = 0; i < BASELINE_FRAMES; i++) {
    const s = await sample();
    baselineFrames.push(s.frame);
    if (s.pose.face) neutral.push(s.pose);
    emit({
      phase: 'baseline',
      command: null,
      stepIndex: 0,
      progress: (i + 1) / BASELINE_FRAMES,
      hint: 'hold',
      box: s.pose.box,
      overall: (i + 1) / BASELINE_FRAMES / units,
    });
    await deps.sleep(opts.pollMs);
  }
  const base: PoseBaseline | null = baselineOf(neutral.slice(-5));

  // 3. Команды.
  const steps: SubmitFaceRequest['steps'] = [];
  for (const [k, command] of commands.entries()) {
    const started = deps.now();
    const buffer: Sample[] = [];
    let hits = 0;
    let timedOut = true;
    while (deps.now() - started < opts.stepMs) {
      const s = await sample();
      const raw = base ? commandProgress(command, base, s.pose) : null;
      const progress = raw ?? 0;
      buffer.push({ ...s, progress });
      if (buffer.length > 12) buffer.shift();
      hits = progress >= opts.target ? hits + 1 : 0;
      const shown = Math.max(0, Math.min(1, progress / opts.target));
      emit({
        phase: 'command',
        command,
        stepIndex: k,
        progress: shown,
        hint: !s.pose.face ? 'NO_FACE' : hits ? 'done' : shown > 0.5 ? 'more' : null,
        box: s.pose.box,
        overall: (1 + k + shown) / units,
      });
      if (hits >= 2 && buffer.length >= perStep) {
        timedOut = false;
        break;
      }
      await deps.sleep(opts.pollMs);
    }
    // Кадры шага: при успехе — последние (включают момент выполнения), иначе — лучшие по прогрессу.
    const chosen = timedOut
      ? [...buffer]
          .sort((a, b) => b.progress - a.progress)
          .slice(0, perStep)
          .sort((a, b) => a.frame.ts - b.frame.ts)
      : buffer.slice(-perStep);
    steps.push({ command, frames: chosen.map((c) => c.frame) });
    if (timedOut)
      emit({
        phase: 'command',
        command,
        stepIndex: k,
        progress: 0,
        hint: 'timeout',
        box: null,
        overall: (2 + k) / units,
      });

    // Возврат в исходное положение перед следующей командой.
    if (k < commands.length - 1) {
      const back = deps.now();
      while (deps.now() - back < 1500) {
        const s = await sample();
        const p = base ? (commandProgress(command, base, s.pose) ?? 0) : 0;
        emit({
          phase: 'return',
          command,
          stepIndex: k,
          progress: 0,
          hint: null,
          box: s.pose.box,
          overall: (2 + k) / units,
        });
        if (p < 0.35) break;
        await deps.sleep(opts.pollMs);
      }
    }
  }
  emit({
    phase: 'checking',
    command: null,
    stepIndex: total,
    progress: 1,
    hint: null,
    box: null,
    overall: 1,
  });
  return { baseline: baselineFrames, steps };
}
