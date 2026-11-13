'use client';

import type { LivenessCommand } from '@bioauth/contracts';
import { type ReactNode, type RefObject, useEffect, useState } from 'react';

import { type TKey, useI18n, useT } from '@/shared/i18n';
import type { CameraState } from '@/shared/lib/camera';
import { useSpeech } from '@/shared/lib/speech';

import { type GuideTone, HeadGuide } from './head-guide';

export interface ViewportGuide {
  readonly command: LivenessCommand | null;
  /** Выполнение текущей команды или совмещения, 0…1: контур заполняется зелёным. */
  readonly progress: number;
  readonly tone: GuideTone;
  readonly box: readonly [number, number, number, number] | null;
  readonly showCenter: boolean;
}

export interface ViewportStep {
  readonly command: LivenessCommand;
  readonly status: 'pending' | 'active' | 'done' | 'failed';
}

const STATE_KEY: Partial<Record<CameraState, TKey>> = {
  idle: 'face.camera.idle',
  starting: 'face.camera.starting',
  denied: 'face.camera.denied',
  unavailable: 'face.camera.unavailable',
  insecure: 'face.camera.insecure',
};

const STEP_ICON: Record<LivenessCommand, string> = {
  TURN_LEFT: '←',
  TURN_RIGHT: '→',
  CHIN_UP: '↑',
  CHIN_DOWN: '↓',
  TILT_LEFT: '↶',
  TILT_RIGHT: '↷',
  MOVE_CLOSER: '⤢',
  MOVE_AWAY: '⤡',
};

/**
 * Окно камеры с контуром головы, направляющими линиями текущей команды и живой подсказкой.
 * Предпросмотр зеркальный — так привычнее; отправляемые кадры не зеркальные. Подсказка дублируется
 * для экранного диктора (aria-live).
 */
export function FaceViewport({
  videoRef,
  state,
  prompt,
  guide,
  overall,
  steps,
  voice = true,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: CameraState;
  prompt?: ReactNode;
  guide?: ViewportGuide;
  overall?: number;
  steps?: readonly ViewportStep[];
  /** Кнопка озвучки подсказок (#42); выключите для экранов без команд. */
  voice?: boolean;
}) {
  const t = useT();
  const { locale } = useI18n();
  const speech = useSpeech(locale);
  const spoken = state === 'ready' && typeof prompt === 'string' ? prompt : null;
  const { announce } = speech;
  useEffect(() => announce(spoken), [announce, spoken]);
  const overlay = STATE_KEY[state];
  const [aspect, setAspect] = useState(4 / 3);
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const update = () => v.videoWidth && setAspect(v.videoWidth / v.videoHeight);
    v.addEventListener('loadedmetadata', update);
    update();
    return () => v.removeEventListener('loadedmetadata', update);
  }, [videoRef, state]);
  const tone = guide?.tone ?? 'neutral';
  return (
    <div className="flex w-full max-w-xl flex-col gap-3">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-2xl bg-[#0b1118] shadow-lg ring-1 ring-black/5">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label={t('face.camera.label')}
          className="h-full w-full -scale-x-100 object-cover"
        />
        {state === 'ready' && (
          <HeadGuide
            tone={tone}
            progress={guide?.progress ?? 0}
            command={guide?.command ?? null}
            showCenter={guide?.showCenter ?? true}
            box={guide?.box ?? null}
            aspect={aspect}
          />
        )}
        {state === 'ready' && prompt && (
          <div className="absolute inset-x-0 top-3 flex justify-center px-3">
            <p
              className={`max-w-[92%] rounded-full px-4 py-1.5 text-center text-sm font-medium shadow backdrop-blur ${
                tone === 'ok'
                  ? 'bg-emerald-500/85 text-white'
                  : tone === 'warn'
                    ? 'bg-amber-400/90 text-[#1b1300]'
                    : 'bg-black/55 text-white'
              }`}
            >
              {prompt}
            </p>
          </div>
        )}
        {voice && speech.supported && state === 'ready' && (
          <button
            type="button"
            onClick={speech.toggle}
            aria-pressed={speech.enabled}
            aria-label={speech.enabled ? t('face.camera.voiceOff') : t('face.camera.voiceOn')}
            title={
              speech.enabled && !speech.hasVoice
                ? t('face.camera.noVoice')
                : speech.enabled
                  ? t('face.camera.voiceOff')
                  : t('face.camera.voiceOn')
            }
            className={`absolute right-3 bottom-4 flex size-10 items-center justify-center rounded-full shadow backdrop-blur transition-colors focus-visible:ring-2 focus-visible:ring-white focus-visible:outline-none ${
              speech.enabled ? 'bg-white/90 text-[#0b1118]' : 'bg-black/55 text-white'
            }`}
          >
            <svg
              viewBox="0 0 24 24"
              className="size-5"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              aria-hidden
            >
              <path d="M11 5 6 9H3v6h3l5 4z" strokeLinejoin="round" />
              {speech.enabled ? (
                <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" strokeLinecap="round" />
              ) : (
                <path d="m16 9 5 6m0-6-5 6" strokeLinecap="round" />
              )}
            </svg>
          </button>
        )}
        {overlay && (
          <p className="absolute inset-0 flex items-center justify-center px-8 text-center text-sm text-white/90">
            {t(overlay)}
          </p>
        )}
        {overall !== undefined && (
          <div className="absolute inset-x-0 bottom-0 h-1.5 bg-white/20">
            <div
              className="h-full bg-emerald-400 transition-[width] duration-300"
              style={{ width: `${Math.round(overall * 100)}%` }}
            />
          </div>
        )}
      </div>
      <p aria-live="assertive" className="sr-only">
        {prompt}
      </p>
      {steps && steps.length > 0 && (
        <ol className="flex flex-wrap gap-2" aria-label={t('face.guide.step', { n: 1, total: steps.length })}>
          {steps.map((s, i) => (
            <li
              key={`${s.command}-${i}`}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                s.status === 'done'
                  ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                  : s.status === 'active'
                    ? 'border-ink bg-ink text-sheet'
                    : s.status === 'failed'
                      ? 'border-far/40 bg-far/10 text-far'
                      : 'border-rule text-graphite'
              }`}
            >
              <span aria-hidden>{s.status === 'done' ? '✓' : STEP_ICON[s.command]}</span>
              {t(`face.commandShort.${s.command}`)}
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
