'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

export type CameraState = 'idle' | 'starting' | 'ready' | 'denied' | 'unavailable' | 'insecure';

/**
 * Камера браузера (NFR-B3: только HTTPS или localhost). Поток останавливается при уходе со страницы.
 * Кадры не сохраняются в браузере: их берёт grabFrame и сразу отправляет на сервер.
 */
export function useCamera() {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [state, setState] = useState<CameraState>('idle');

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setState('idle');
  }, []);

  const start = useCallback(async () => {
    if (!window.isSecureContext) {
      setState('insecure');
      return;
    }
    // В старых браузерах и небезопасном контексте mediaDevices отсутствует, хотя типы DOM этого не отражают.
    if (!('mediaDevices' in navigator) || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      setState('unavailable');
      return;
    }
    setState('starting');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      });
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => undefined);
      }
      setState('ready');
    } catch (err) {
      const name = err instanceof DOMException ? err.name : '';
      setState(name === 'NotAllowedError' || name === 'SecurityError' ? 'denied' : 'unavailable');
    }
  }, []);

  useEffect(() => stop, [stop]);

  return { videoRef, state, start, stop };
}

export interface CapturedFrame {
  readonly image: string;
  readonly ts: number;
}

/** Текущий кадр видео как JPEG (base64, без зеркалирования); длинная сторона не больше maxSide. */
export function grabFrame(video: HTMLVideoElement, maxSide = 640, quality = 0.85): CapturedFrame {
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const k = Math.min(1, maxSide / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas 2d недоступен');
  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    image: canvas.toDataURL('image/jpeg', quality),
    ts: Math.round(performance.timeOrigin + performance.now()),
  };
}

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Кадр для проверки и уменьшенный кадр для подсказки позы — из одного и того же момента видео. */
export function grabPair(video: HTMLVideoElement): {
  full: CapturedFrame;
  small: { image: string; width: number; height: number };
} {
  const full = grabFrame(video);
  const w = video.videoWidth || 640;
  const h = video.videoHeight || 480;
  const k = Math.min(1, 320 / Math.max(w, h));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(w * k);
  canvas.height = Math.round(h * k);
  canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
  return {
    full,
    small: { image: canvas.toDataURL('image/jpeg', 0.7), width: canvas.width, height: canvas.height },
  };
}
