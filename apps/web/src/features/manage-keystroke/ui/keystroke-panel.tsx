'use client';

import {
  KEYSTROKE_ENROLL_SAMPLES,
  type KeystrokeSample,
  type KeystrokeVerifyResultDto,
} from '@bioauth/contracts';
import { useState } from 'react';

import { RhythmField } from '@/entities/keystroke';
import { ApiError } from '@/shared/api';
import { useT } from '@/shared/i18n';
import { ApiErrorNotice, Badge, Button, Notice, Skeleton } from '@/shared/ui';

import {
  useKeystrokeEnroll,
  useKeystrokeRemove,
  useKeystrokeStatus,
  useKeystrokeVerify,
} from '../api/keystroke';

type Mode = 'idle' | 'enroll' | 'test';

/** Ритм набора: регистрация (несколько повторов фразы), проверка и удаление. */
export function KeystrokePanel() {
  const t = useT();
  const status = useKeystrokeStatus();
  const enroll = useKeystrokeEnroll();
  const verify = useKeystrokeVerify();
  const remove = useKeystrokeRemove();
  const [mode, setMode] = useState<Mode>('idle');
  const [collected, setCollected] = useState<KeystrokeSample[]>([]);
  const [round, setRound] = useState(0);
  const [result, setResult] = useState<KeystrokeVerifyResultDto | null>(null);
  const [consistency, setConsistency] = useState<number | null>(null);

  if (status.isPending) return <Skeleton className="h-24 w-full" />;
  if (!status.data) return <ApiErrorNotice error={status.error} />;
  const st = status.data;
  const total = st.required;

  const reset = () => {
    setMode('idle');
    setCollected([]);
    setRound((r) => r + 1);
    setResult(null);
    enroll.reset();
    verify.reset();
  };

  function onEnrollSample(s: KeystrokeSample) {
    const next = [...collected, s];
    setCollected(next);
    setRound((r) => r + 1);
    if (next.length >= total) {
      enroll.mutate(next, {
        onSuccess: (r) => {
          setConsistency(r.consistency);
          reset();
        },
        onError: () => {
          setCollected([]);
          setRound((r) => r + 1);
        },
      });
    }
  }

  function onTestSample(s: KeystrokeSample) {
    verify.mutate(s, { onSuccess: setResult });
    setRound((r) => r + 1);
  }

  const locked = verify.error instanceof ApiError && verify.error.problem.status === 429;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col gap-1">
          <span className="flex items-center gap-2 text-sm font-medium">
            {t('keystroke.title')}
            <Badge tone={st.enrolled ? 'optimum' : 'neutral'} dot>
              {st.enrolled ? t('keystroke.on') : t('keystroke.off')}
            </Badge>
          </span>
          {st.updatedAt && (
            <span className="text-xs text-graphite">
              {t('keystroke.since', { date: new Date(st.updatedAt).toLocaleDateString() })}
            </span>
          )}
        </div>
        {mode === 'idle' && (
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant={st.enrolled ? 'secondary' : 'primary'}
              onClick={() => setMode('enroll')}
            >
              {st.enrolled ? t('keystroke.redo') : t('keystroke.start')}
            </Button>
            {st.enrolled && (
              <>
                <Button size="sm" onClick={() => setMode('test')}>
                  {t('keystroke.test')}
                </Button>
                <Button size="sm" variant="danger" busy={remove.isPending} onClick={() => remove.mutate()}>
                  {t('keystroke.remove')}
                </Button>
              </>
            )}
          </div>
        )}
      </div>
      {mode === 'idle' && <p className="max-w-prose text-xs text-graphite">{t('keystroke.note')}</p>}
      {mode === 'idle' && consistency !== null && (
        <Notice tone="success">{t('keystroke.done', { value: consistency })}</Notice>
      )}
      <ApiErrorNotice error={remove.error ?? (mode === 'idle' ? enroll.error : null)} />

      {mode === 'enroll' && (
        <div className="flex flex-col gap-3">
          <p className="text-sm font-medium" aria-live="polite">
            {enroll.isPending
              ? t('keystroke.saving')
              : t('keystroke.repeat', { n: Math.min(collected.length + 1, total), total })}
          </p>
          <progress className="sr-only" value={collected.length} max={KEYSTROKE_ENROLL_SAMPLES} />
          <RhythmField
            phrase={st.phrase}
            resetKey={round}
            disabled={enroll.isPending}
            onSample={onEnrollSample}
          />
          <ApiErrorNotice error={enroll.error} />
          <div>
            <Button variant="ghost" onClick={reset}>
              {t('keystroke.cancel')}
            </Button>
          </div>
        </div>
      )}

      {mode === 'test' && (
        <div className="flex flex-col gap-3">
          <RhythmField
            phrase={st.phrase}
            resetKey={round}
            disabled={verify.isPending || locked}
            onSample={onTestSample}
          />
          {locked ? (
            <Notice tone="caution">{t('keystroke.locked')}</Notice>
          ) : (
            <ApiErrorNotice error={verify.error} />
          )}
          {result && (
            <Notice
              tone={result.accepted ? 'success' : 'error'}
              title={result.accepted ? t('keystroke.accepted') : t('keystroke.rejected')}
            >
              {t('keystroke.result', { distance: result.distance, threshold: result.threshold })}
            </Notice>
          )}
          <div>
            <Button variant="ghost" onClick={reset}>
              {t('keystroke.cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
