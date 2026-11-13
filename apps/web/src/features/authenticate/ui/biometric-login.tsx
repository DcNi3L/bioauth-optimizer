'use client';

import type { AuthSessionDto, AuthStepResultDto, LivenessCommand } from '@bioauth/contracts';
import { useRef, useState } from 'react';

import { FaceViewport, type ViewportGuide, type ViewportStep } from '@/entities/face';
import { RhythmField } from '@/entities/keystroke';
import { useRefreshViewer } from '@/entities/viewer';
import { ApiError } from '@/shared/api';
import { type TKey, useI18n } from '@/shared/i18n';
import { grabPair, sleep, useCamera } from '@/shared/lib/camera';
import { ApiErrorNotice, Button, CodeField, Notice, TextField } from '@/shared/ui';

import {
  passkeyStep,
  posePreview,
  startSession,
  submitFace,
  submitKeystrokeStep,
  submitTotpStep,
} from '../api/auth';
import { CaptureAborted, guidedCapture, type GuideState } from '../model/guided-capture';

type Phase = 'login' | 'face' | 'passkey' | 'totp' | 'keystroke' | 'done' | 'failed';

const ALIGN_KEY: Record<string, TKey> = {
  closer: 'face.guide.alignCloser',
  farther: 'face.guide.alignFarther',
  center: 'face.guide.alignCenter',
  straight: 'face.guide.alignStraight',
  hold: 'face.guide.hold',
};

/** Подсказка, тон контура и направляющие для текущего состояния управляемой съёмки. */
function present(
  g: GuideState | null,
  t: ReturnType<typeof useI18n>['t'],
): { text: string; guide: ViewportGuide } {
  if (!g)
    return {
      text: t('face.guide.align'),
      guide: { command: null, progress: 0, tone: 'neutral', box: null, showCenter: true },
    };
  const base = { box: g.box, showCenter: g.phase !== 'command' };
  if (g.phase === 'align') {
    const key =
      g.hint && g.hint in ALIGN_KEY
        ? ALIGN_KEY[g.hint]!
        : g.hint && g.hint !== 'ok'
          ? (`face.issue.${g.hint}` as TKey)
          : 'face.guide.align';
    return {
      text: t(key),
      guide: { ...base, command: null, progress: g.progress, tone: g.hint === 'hold' ? 'ok' : 'warn' },
    };
  }
  if (g.phase === 'baseline')
    return {
      text: t('face.guide.lookStraight'),
      guide: { ...base, command: null, progress: g.progress, tone: 'ok' },
    };
  if (g.phase === 'command' && g.command) {
    const text =
      g.hint === 'NO_FACE'
        ? t('face.issue.NO_FACE')
        : g.hint === 'done'
          ? t('face.guide.done')
          : g.hint === 'timeout'
            ? t('face.guide.timeout')
            : g.hint === 'more'
              ? `${t(`face.command.${g.command}`)} · ${t('face.guide.more')}`
              : g.total > 1
                ? `${t('face.guide.step', { n: g.stepIndex + 1, total: g.total })} · ${t(`face.command.${g.command}`)}`
                : t(`face.command.${g.command}`);
    const tone = g.hint === 'done' ? 'ok' : g.hint === 'NO_FACE' || g.hint === 'timeout' ? 'warn' : 'neutral';
    return { text, guide: { ...base, command: g.command, progress: g.progress, tone } };
  }
  if (g.phase === 'return')
    return { text: t('face.guide.back'), guide: { ...base, command: null, progress: 0, tone: 'neutral' } };
  return { text: t('face.guide.checking'), guide: { ...base, command: null, progress: 1, tone: 'ok' } };
}

/**
 * Вход субъекта по активной политике (UC-4): шаги в порядке политики — лицо с управляемыми командами, passkey,
 * код из приложения или ритм набора (#48).
 */
export function BiometricLogin({ onSuccess }: { onSuccess?: () => void }) {
  const { t, locale } = useI18n();
  const { videoRef, state, start, stop } = useCamera();
  const refresh = useRefreshViewer();
  const [login, setLogin] = useState('');
  const [phase, setPhase] = useState<Phase>('login');
  const [session, setSession] = useState<AuthSessionDto | null>(null);
  const [commands, setCommands] = useState<LivenessCommand[]>([]);
  const [result, setResult] = useState<AuthStepResultDto | null>(null);
  const [guide, setGuide] = useState<GuideState | null>(null);
  const [capturing, setCapturing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const abortRef = useRef<AbortController | null>(null);
  const [code, setCode] = useState('');
  const [round, setRound] = useState(0);

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
    if (step?.factor !== 'face') stop();
    setCode('');
    setRound((x) => x + 1);
    setPhase(step?.factor ?? 'face');
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
    const video = videoRef.current;
    if (!session || !video) return;
    setBusy(true);
    setCapturing(true);
    setError(null);
    setResult(null);
    const abort = new AbortController();
    abortRef.current = abort;
    let doneStep = -1;
    try {
      const body = await guidedCapture(commands, {
        grab: () => {
          const { full, small } = grabPair(video);
          return { full: { image: full.image, ts: full.ts }, small };
        },
        pose: (f) => posePreview(session.sessionId, f),
        sleep,
        now: () => performance.now(),
        onUpdate: (g) => {
          // Короткая вибрация на телефоне, когда движение засчитано: можно не смотреть на экран.
          if (g.hint === 'done' && g.stepIndex !== doneStep) {
            doneStep = g.stepIndex;
            if (typeof navigator.vibrate === 'function') navigator.vibrate(40);
          }
          setGuide(g);
        },
        signal: abort.signal,
      });
      const r = await submitFace(session.sessionId, body);
      setResult(r);
      nextPhase(session, r);
    } catch (err) {
      if (!(err instanceof CaptureAborted)) setError(err);
    } finally {
      abortRef.current = null;
      setGuide(null);
      setCapturing(false);
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

  async function runStep(fn: () => Promise<AuthStepResultDto>) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const r = await fn();
      setResult(r);
      nextPhase(session, r);
    } catch (err) {
      setError(err);
      setRound((x) => x + 1);
    } finally {
      setBusy(false);
    }
  }

  function reset() {
    abortRef.current?.abort();
    stop();
    setPhase('login');
    setSession(null);
    setResult(null);
    setError(null);
    setGuide(null);
  }

  const locked = error instanceof ApiError && error.status === 429;
  const lockedUntil = locked ? (error.problem.lockedUntil ?? null) : result?.lockedUntil;
  const shown = present(guide, t);
  const steps: ViewportStep[] = commands.map((command, i) => ({
    command,
    status: !guide
      ? 'pending'
      : guide.phase === 'checking' || i < guide.stepIndex
        ? 'done'
        : i === guide.stepIndex && guide.phase === 'command'
          ? guide.hint === 'done'
            ? 'done'
            : 'active'
          : 'pending',
  }));

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
            label={t('auth.login')}
            value={login}
            onChange={(e) => setLogin(e.target.value)}
            autoComplete="username"
            required
          />
          <div>
            <Button type="submit" busy={busy} disabled={login.trim().length < 3}>
              {t('auth.continue')}
            </Button>
          </div>
        </form>
      )}

      {session && !session.calibrated && phase !== 'done' && (
        <Notice tone="caution">{t('auth.uncalibrated', { v: session.policyVersion })}</Notice>
      )}

      {result?.outcome === 'retry' && !capturing && (
        <Notice
          tone="caution"
          title={result.reason ? t(`face.reason.${result.reason}`) : t('auth.retryTitle')}
        >
          {result.reason ? t(`auth.reasonText.${result.reason}`) : result.message}{' '}
          {t('auth.attemptsLeft', { n: result.attemptsLeft })}
        </Notice>
      )}

      {phase === 'face' && (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-graphite">
            {t('auth.faceIntro', { list: commands.map((c) => t(`face.commandShort.${c}`)).join(', ') })}
          </p>
          <FaceViewport
            videoRef={videoRef}
            state={state}
            prompt={capturing ? shown.text : state === 'ready' ? t('face.guide.align') : undefined}
            guide={capturing ? shown.guide : undefined}
            overall={capturing ? guide?.overall : undefined}
            steps={steps}
          />
          {!capturing && <p className="text-xs text-graphite">{t('auth.tips')}</p>}
          <div className="flex flex-wrap gap-2">
            {state === 'ready' ? (
              <Button onClick={() => void runFace()} busy={busy}>
                {result?.outcome === 'retry' ? t('auth.retryCheck') : t('auth.startCheck')}
              </Button>
            ) : (
              <Button onClick={() => void start()} busy={state === 'starting'}>
                {t('face.camera.enable')}
              </Button>
            )}
            {capturing ? (
              <Button variant="secondary" onClick={() => abortRef.current?.abort()}>
                {t('auth.stopCheck')}
              </Button>
            ) : (
              <Button variant="secondary" onClick={reset} disabled={busy}>
                {t('common.cancel')}
              </Button>
            )}
          </div>
        </div>
      )}

      {phase !== 'face' && result?.outcome === 'continue' && (
        <Notice tone="success">
          {session?.steps[result.currentStep - 1]?.factor === 'face'
            ? t('auth.faceAccepted')
            : t('auth.stepAccepted')}
        </Notice>
      )}

      {phase === 'totp' && session && (
        <form
          className="flex flex-col gap-3 sm:max-w-sm"
          onSubmit={(e) => {
            e.preventDefault();
            void runStep(() => submitTotpStep(session.sessionId, code));
          }}
        >
          <p className="text-sm">{t('auth.totpIntro')}</p>
          <CodeField
            key={round}
            label={t('mfa.codeLabel')}
            hint={t('mfa.codeHint')}
            value={code}
            onChange={setCode}
            focusOnMount
          />
          <div className="flex gap-2">
            <Button type="submit" busy={busy} disabled={code.length !== 6}>
              {t('auth.totpSubmit')}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </form>
      )}

      {phase === 'keystroke' && session && (
        <div className="flex flex-col gap-3 sm:max-w-lg">
          <p className="text-sm">{t('auth.keystrokeIntro')}</p>
          <RhythmField
            phrase={(() => {
              const s = session.steps.find((x) => x.factor === 'keystroke');
              return s?.factor === 'keystroke' ? s.phrase : '';
            })()}
            disabled={busy}
            resetKey={round}
            onSample={(sample) => void runStep(() => submitKeystrokeStep(session.sessionId, sample))}
          />
          <div>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {phase === 'passkey' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm">{t('auth.passkeyIntro')}</p>
          <div className="flex gap-2">
            <Button onClick={() => void runPasskey()} busy={busy}>
              {t('auth.passkeyConfirm')}
            </Button>
            <Button variant="secondary" onClick={reset} disabled={busy}>
              {t('common.cancel')}
            </Button>
          </div>
        </div>
      )}

      {phase === 'done' && (
        <Notice tone="success" title={t('auth.done')}>
          {t('auth.welcome')}
        </Notice>
      )}

      {(phase === 'failed' || locked) && (
        <Notice tone="error" title={result?.reason ? t(`face.reason.${result.reason}`) : t('auth.failed')}>
          {locked ? error.message : result?.reason ? t(`auth.reasonText.${result.reason}`) : result?.message}
          {lockedUntil && (
            <> {t('auth.retryAfter', { time: new Date(lockedUntil).toLocaleTimeString(locale) })}</>
          )}
        </Notice>
      )}
      {!locked && <ApiErrorNotice error={error} />}
      {phase === 'failed' && (
        <div>
          <Button variant="secondary" onClick={reset}>
            {t('auth.restart')}
          </Button>
        </div>
      )}
    </div>
  );
}
