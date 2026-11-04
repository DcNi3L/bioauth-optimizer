'use client';

import type {
  AuthSessionDto,
  AuthStepResultDto,
  LivenessCommand,
  SubmitFaceRequest,
} from '@bioauth/contracts';
import { useState } from 'react';

import { COMMAND_ICON, COMMAND_TEXT, FaceViewport, REASON_TITLES } from '@/entities/face';
import { useRefreshViewer } from '@/entities/viewer';
import { ApiError } from '@/shared/api';
import { grabFrame, sleep, useCamera } from '@/shared/lib/camera';
import { ApiErrorNotice, Button, Notice, TextField } from '@/shared/ui';

import { passkeyStep, startSession, submitFace } from '../api/auth';

const BASELINE_FRAMES = 2;
const STEP_FRAMES = 4;
const FRAME_INTERVAL_MS = 350;

type Phase = 'login' | 'face' | 'passkey' | 'done' | 'failed';

/** Съёмка попытки: нейтральные кадры, затем кадры каждой команды с подсказкой и пиктограммой. */
async function captureAttempt(
  video: HTMLVideoElement,
  commands: readonly LivenessCommand[],
  show: (text: string, icon?: string, progress?: number) => void,
): Promise<SubmitFaceRequest> {
  const total = BASELINE_FRAMES + commands.length * STEP_FRAMES;
  let done = 0;
  show('Смотрите прямо в камеру');
  await sleep(1200);
  const baseline = [];
  for (let i = 0; i < BASELINE_FRAMES; i++) {
    baseline.push(grabFrame(video));
    show('Смотрите прямо в камеру', undefined, ++done / total);
    await sleep(FRAME_INTERVAL_MS);
  }
  const steps = [];
  for (const command of commands) {
    show(COMMAND_TEXT[command], COMMAND_ICON[command], done / total);
    await sleep(900);
    const frames = [];
    for (let i = 0; i < STEP_FRAMES; i++) {
      frames.push(grabFrame(video));
      show(COMMAND_TEXT[command], COMMAND_ICON[command], ++done / total);
      await sleep(FRAME_INTERVAL_MS);
    }
    steps.push({ command, frames });
    show('Вернитесь в исходное положение', undefined, done / total);
    await sleep(500);
  }
  return { baseline, steps };
}

/** Вход субъекта по активной политике (UC-4): лицо с командами, затем passkey, если он в политике. */
export function BiometricLogin({ onSuccess }: { onSuccess?: () => void }) {
  const { videoRef, state, start, stop } = useCamera();
  const refresh = useRefreshViewer();
  const [login, setLogin] = useState('');
  const [phase, setPhase] = useState<Phase>('login');
  const [session, setSession] = useState<AuthSessionDto | null>(null);
  const [commands, setCommands] = useState<LivenessCommand[]>([]);
  const [result, setResult] = useState<AuthStepResultDto | null>(null);
  const [prompt, setPrompt] = useState<{ text: string; icon?: string; progress?: number }>({ text: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);

  function nextPhase(s: AuthSessionDto, r: AuthStepResultDto | null) {
    if (r?.outcome === 'accepted') {
      stop();
      setPhase('done');
      void refresh();
      onSuccess?.();
      return;
    }
    if (r && (r.outcome === 'rejected' || r.outcome === 'locked')) {
      stop();
      setPhase('failed');
      return;
    }
    if (r?.commands) setCommands(r.commands);
    const step = s.steps[r?.currentStep ?? 0];
    setPhase(step?.factor === 'passkey' ? 'passkey' : 'face');
  }

  async function begin() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const s = await startSession(login.trim());
      setSession(s);
      const face = s.steps.find((x) => x.factor === 'face');
      setCommands(face?.factor === 'face' ? face.commands : []);
      nextPhase(s, null);
      if (s.steps[0]?.factor === 'face') await start();
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  async function runFace() {
    if (!session || !videoRef.current) return;
    setBusy(true);
    setError(null);
    try {
      const body = await captureAttempt(videoRef.current, commands, (text, icon, progress) =>
        setPrompt({ text, icon, progress }),
      );
      setPrompt({ text: 'Проверяю…' });
      const r = await submitFace(session.sessionId, body);
      setResult(r);
      setPrompt({ text: '' });
      nextPhase(session, r);
    } catch (err) {
      setError(err);
      setPrompt({ text: '' });
    } finally {
      setBusy(false);
    }
  }

  async function runPasskey() {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const r = await passkeyStep(session.sessionId);
      setResult(r);
      nextPhase(session, r);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    stop();
    setPhase('login');
    setSession(null);
    setResult(null);
    setError(null);
  }

  const locked = error instanceof ApiError && error.status === 429;
  const lockedUntil = locked ? (error.problem.lockedUntil ?? null) : result?.lockedUntil;

  return (
    <div className="flex flex-col gap-5">
      {phase === 'login' && (
        <form
          className="flex flex-col gap-4 sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void begin();
          }}
        >
          <TextField
            label="Логин"
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
          />
          <div>
            <Button type="submit" busy={busy} disabled={login.trim().length < 3}>
              Продолжить
            </Button>
          </div>
        </form>
      )}

      {session && !session.calibrated && phase !== 'done' && (
        <Notice tone="caution">
          Пороги политики v{session.policyVersion} ещё не откалиброваны: используются значения по умолчанию.
        </Notice>
      )}

      {result?.outcome === 'retry' && (
        <Notice tone="caution" title={result.reason ? REASON_TITLES[result.reason] : 'Повторите'}>
          {result.message}. Осталось попыток: {result.attemptsLeft}.
        </Notice>
      )}

      {phase === 'face' && (
        <div className="flex flex-col gap-4">
          <p className="text-graphite text-sm">
            Шаг 1. Расположите лицо в овале и выполните команды на экране:{' '}
            {commands.map((c) => COMMAND_TEXT[c].toLowerCase()).join(', ')}.
          </p>
          <FaceViewport
            videoRef={videoRef}
            state={state}
            prompt={prompt.text}
            icon={prompt.icon}
            progress={prompt.progress}
          />
          <div className="flex gap-2">
            {state === 'ready' ? (
              <Button onClick={() => void runFace()} busy={busy}>
                {result?.outcome === 'retry' ? 'Повторить проверку' : 'Начать проверку'}
              </Button>
            ) : (
              <Button onClick={() => void start()} busy={state === 'starting'}>
                Включить камеру
              </Button>
            )}
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {phase === 'passkey' && (
        <div className="flex flex-col gap-3">
          {result?.outcome === 'continue' && <Notice tone="success">Лицо подтверждено.</Notice>}
          <p className="text-sm">
            Шаг 2. Подтвердите вход passkey на этом устройстве: отпечатком пальца, Face ID или Windows Hello.
          </p>
          <div className="flex gap-2">
            <Button onClick={() => void runPasskey()} busy={busy}>
              Подтвердить passkey
            </Button>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              Отмена
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <Notice tone="success" title="Вход выполнен">
          Добро пожаловать.
        </Notice>
      )}

      {(phase === 'failed' || locked) && (
        <Notice tone="error" title={result?.reason ? REASON_TITLES[result.reason] : 'Вход не выполнен'}>
          {locked ? error.message : result?.message}
          {lockedUntil && <> Повторить можно после {new Date(lockedUntil).toLocaleTimeString('ru-RU')}.</>}
        </Notice>
      )}
      {!locked && <ApiErrorNotice error={error} />}
      {phase === 'failed' && (
        <div>
          <Button variant="secondary" onClick={reset}>
            Начать заново
          </Button>
        </div>
      )}
    </div>
  );
}
