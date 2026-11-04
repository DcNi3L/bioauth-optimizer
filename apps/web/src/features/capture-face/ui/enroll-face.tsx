'use client';

import { useState } from 'react';

import { FaceViewport, issueHints } from '@/entities/face';
import { ApiError } from '@/shared/api';
import { type CapturedFrame, grabFrame, sleep, useCamera } from '@/shared/lib/camera';
import { ApiErrorNotice, Button, Notice } from '@/shared/ui';

import { useEnrollFace } from '../api/enroll';

const FRAMES = 5;
const INTERVAL_MS = 400;

/** Регистрация лица (UC-2): обратный отсчёт, 5 кадров, подсказки по качеству при неудаче. */
export function EnrollFace({ onDone }: { onDone?: () => void }) {
  const { videoRef, state, start } = useCamera();
  const enroll = useEnrollFace();
  const [prompt, setPrompt] = useState<string>('Включите камеру и расположите лицо в овале');
  const [progress, setProgress] = useState<number | undefined>();
  const [busy, setBusy] = useState(false);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    enroll.reset();
    try {
      for (const n of [3, 2, 1]) {
        setPrompt(`Смотрите прямо в камеру… ${n}`);
        await sleep(700);
      }
      setPrompt('Снимаю — не двигайтесь');
      const frames: CapturedFrame[] = [];
      for (let i = 0; i < FRAMES; i++) {
        frames.push(grabFrame(video));
        setProgress((i + 1) / FRAMES);
        await sleep(INTERVAL_MS);
      }
      setPrompt('Проверяю кадры…');
      await enroll.mutateAsync(frames);
      setPrompt('Лицо зарегистрировано');
      onDone?.();
    } catch {
      setPrompt('Не получилось — смотрите подсказки ниже');
    } finally {
      setBusy(false);
      setProgress(undefined);
    }
  }

  const err = enroll.error;
  const frames = err instanceof ApiError ? err.problem.frames : undefined;
  const hints = frames ? issueHints(frames) : [];
  return (
    <div className="flex flex-col gap-4">
      <FaceViewport videoRef={videoRef} state={state} prompt={prompt} progress={progress} />
      {hints.length > 0 ? (
        <Notice tone="caution" title="Кадры не подошли">
          <ul className="list-inside list-disc">
            {hints.map((h) => (
              <li key={h}>{h}</li>
            ))}
          </ul>
        </Notice>
      ) : (
        <ApiErrorNotice error={err} />
      )}
      {enroll.isSuccess && (
        <Notice tone="success" title="Лицо зарегистрировано">
          Шаблон построен по {enroll.data.framesUsed} кадрам и сохранён в зашифрованном виде. Сами кадры не
          сохраняются.
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {state !== 'ready' ? (
          <Button onClick={() => void start()} busy={state === 'starting'}>
            Включить камеру
          </Button>
        ) : (
          <Button onClick={() => void capture()} busy={busy}>
            {enroll.isSuccess ? 'Снять заново' : 'Снять лицо'}
          </Button>
        )}
      </div>
    </div>
  );
}
