'use client';

import { useState } from 'react';

import {
  type AlignHint,
  alignment,
  FaceViewport,
  type GuideTone,
  issueHints,
  type PoseSample,
} from '@/entities/face';
import { ApiError } from '@/shared/api';
import { type TKey, useT } from '@/shared/i18n';
import { type CapturedFrame, grabFrame, grabPair, sleep, useCamera } from '@/shared/lib/camera';
import { ApiErrorNotice, Button, Notice } from '@/shared/ui';

import { enrollPose, useEnrollFace } from '../api/enroll';

const FRAMES = 5;
const INTERVAL_MS = 350;
const ALIGN_MS = 9000;

const HINT_KEY: Partial<Record<AlignHint, TKey>> = {
  closer: 'face.guide.alignCloser',
  farther: 'face.guide.alignFarther',
  center: 'face.guide.alignCenter',
  straight: 'face.guide.alignStraight',
};

/** Регистрация лица (UC-2): живое совмещение с контуром головы, затем 5 кадров; подсказки по качеству. */
export function EnrollFace({ onDone }: { onDone?: () => void }) {
  const t = useT();
  const { videoRef, state, start } = useCamera();
  const enroll = useEnrollFace();
  const [prompt, setPrompt] = useState<string | undefined>();
  const [tone, setTone] = useState<GuideTone>('neutral');
  const [box, setBox] = useState<PoseSample['box']>(null);
  const [progress, setProgress] = useState(0);
  const [busy, setBusy] = useState(false);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    enroll.reset();
    try {
      // Совмещение: не дольше ALIGN_MS; если сервер подсказок недоступен — снимаем как есть.
      const started = performance.now();
      let ok = 0;
      while (performance.now() - started < ALIGN_MS && ok < 2) {
        const { small } = grabPair(video);
        const pose = await enrollPose(small).catch(() => null);
        if (!pose) break;
        const hint = alignment(pose);
        ok = hint === 'ok' ? ok + 1 : 0;
        setBox(pose.box);
        setTone(hint === 'ok' ? 'ok' : 'warn');
        setProgress(ok / 2);
        setPrompt(hint === 'ok' ? t('face.guide.hold') : t(HINT_KEY[hint] ?? (`face.issue.${hint}` as TKey)));
        await sleep(150);
      }
      setTone('ok');
      setPrompt(t('enroll.holding'));
      const frames: CapturedFrame[] = [];
      for (let i = 0; i < FRAMES; i++) {
        frames.push(grabFrame(video));
        setProgress((i + 1) / FRAMES);
        await sleep(INTERVAL_MS);
      }
      setPrompt(t('face.guide.checking'));
      await enroll.mutateAsync(frames);
      setPrompt(t('enroll.success'));
      onDone?.();
    } catch {
      setTone('warn');
      setPrompt(t('enroll.framesBad'));
    } finally {
      setBusy(false);
      setProgress(0);
      setBox(null);
    }
  }

  const err = enroll.error;
  const frames = err instanceof ApiError ? err.problem.frames : undefined;
  const hints = frames ? issueHints(frames, t) : [];
  return (
    <div className="flex flex-col gap-4">
      <FaceViewport
        videoRef={videoRef}
        state={state}
        prompt={prompt ?? (state === 'ready' ? t('face.guide.align') : undefined)}
        guide={{ command: null, progress, tone: busy ? tone : 'neutral', box, showCenter: true }}
      />
      {!busy && !enroll.isSuccess && state === 'ready' && (
        <p className="text-xs text-graphite">{t('enroll.hint')}</p>
      )}
      {hints.length > 0 ? (
        <Notice tone="caution" title={t('enroll.framesBad')}>
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
        <Notice tone="success" title={t('enroll.success')}>
          {t('enroll.successText', { n: enroll.data.framesUsed })}
        </Notice>
      )}
      <div className="flex flex-wrap gap-2">
        {state !== 'ready' ? (
          <Button onClick={() => void start()} busy={state === 'starting'}>
            {t('face.camera.enable')}
          </Button>
        ) : (
          <Button onClick={() => void capture()} busy={busy}>
            {enroll.isSuccess ? t('enroll.recapture') : t('enroll.capture')}
          </Button>
        )}
      </div>
    </div>
  );
}
