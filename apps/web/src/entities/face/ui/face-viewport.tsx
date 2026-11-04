'use client';

import type { ReactNode, RefObject } from 'react';

import type { CameraState } from '@/shared/lib/camera';

const STATE_TEXT: Partial<Record<CameraState, string>> = {
  idle: 'Камера выключена',
  starting: 'Включаю камеру…',
  denied: 'Доступ к камере запрещён. Разрешите его в настройках браузера и обновите страницу.',
  unavailable: 'Камера не найдена или занята другим приложением.',
  insecure: 'Камера доступна только по HTTPS или на localhost.',
};

/**
 * Окно камеры с овалом-ориентиром. Предпросмотр зеркальный — так привычнее; отправляемые кадры — нет.
 * Подсказка дублируется для экранного диктора (aria-live).
 */
export function FaceViewport({
  videoRef,
  state,
  prompt,
  icon,
  progress,
}: {
  videoRef: RefObject<HTMLVideoElement | null>;
  state: CameraState;
  prompt?: ReactNode;
  icon?: string;
  progress?: number;
}) {
  const overlay = STATE_TEXT[state];
  return (
    <div className="flex flex-col gap-3">
      <div className="bg-ink relative aspect-[4/3] w-full max-w-xl overflow-hidden rounded-lg">
        <video
          ref={videoRef}
          muted
          playsInline
          aria-label="Изображение с камеры"
          className="h-full w-full -scale-x-100 object-cover"
        />
        {state === 'ready' && (
          <svg
            viewBox="0 0 400 300"
            className="pointer-events-none absolute inset-0 h-full w-full"
            aria-hidden
          >
            <defs>
              <mask id="face-hole">
                <rect width="400" height="300" fill="white" />
                <ellipse cx="200" cy="140" rx="82" ry="108" fill="black" />
              </mask>
            </defs>
            <rect width="400" height="300" fill="rgba(23,32,43,0.45)" mask="url(#face-hole)" />
            <ellipse
              cx="200"
              cy="140"
              rx="82"
              ry="108"
              fill="none"
              stroke="#fbfcfa"
              strokeWidth="2"
              strokeDasharray="6 5"
            />
          </svg>
        )}
        {icon && state === 'ready' && (
          <span className="text-sheet absolute right-4 top-3 font-serif text-5xl drop-shadow" aria-hidden>
            {icon}
          </span>
        )}
        {overlay && (
          <p className="text-sheet absolute inset-0 flex items-center justify-center px-8 text-center text-sm">
            {overlay}
          </p>
        )}
        {progress !== undefined && (
          <div className="bg-sheet/30 absolute bottom-0 left-0 right-0 h-1.5">
            <div
              className="bg-optimum h-full transition-[width] duration-300"
              style={{ width: `${Math.round(progress * 100)}%` }}
            />
          </div>
        )}
      </div>
      <p aria-live="assertive" className="min-h-7 text-lg font-medium">
        {prompt}
      </p>
    </div>
  );
}
