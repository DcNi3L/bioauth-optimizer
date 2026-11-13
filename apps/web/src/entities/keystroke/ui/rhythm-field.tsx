'use client';

import type { KeystrokeSample } from '@bioauth/contracts';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useT } from '@/shared/i18n';
import { Notice } from '@/shared/ui';

import { RhythmRecorder } from '../model/recorder';

/**
 * Поле набора фразы: само записывает ритм (клавиши и время) и сообщает о каждом готовом вводе.
 * Исправления не допускаются: ошибка начинает повтор заново, иначе паузы на исправления испортят шаблон.
 */
export function RhythmField({
  phrase,
  disabled,
  resetKey,
  onSample,
}: {
  phrase: string;
  disabled?: boolean;
  /** Смена значения очищает поле (новый повтор). */
  resetKey: number;
  onSample: (s: KeystrokeSample) => void;
}) {
  const t = useT();
  const recorder = useMemo(() => new RhythmRecorder(phrase), [phrase]);
  const [typed, setTyped] = useState(0);
  const [wrong, setWrong] = useState(false);
  const [touch, setTouch] = useState(false);
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    recorder.reset();
    setTyped(0);
    setWrong(false);
  }, [resetKey, recorder]);
  useEffect(() => setTouch(window.matchMedia('(pointer: coarse)').matches), []);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm">{t('keystroke.phraseLabel')}</p>
      <p className="num bg-sheet border-rule rounded-md border p-3 text-lg tracking-wide" aria-hidden>
        {phrase.split('').map((ch, i) => (
          <span
            key={i}
            className={i < typed ? 'text-optimum' : i === typed ? 'bg-frr-bg text-ink' : 'text-graphite'}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </p>
      <input
        ref={ref}
        className="num bg-sheet border-rule focus:border-frr h-10 rounded-md border px-3 text-[15px] outline-none"
        aria-label={t('keystroke.phraseLabel')}
        placeholder={t('keystroke.placeholder')}
        value={phrase.slice(0, typed)}
        disabled={disabled}
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck={false}
        onChange={() => undefined}
        onPaste={(e) => e.preventDefault()}
        onKeyDown={(e) => {
          const r = recorder.keyDown({
            code: e.code,
            timeStamp: e.timeStamp,
            repeat: e.repeat,
            shiftKey: e.shiftKey,
            ctrlKey: e.ctrlKey,
            altKey: e.altKey,
            metaKey: e.metaKey,
          });
          if (r.kind !== 'ignored') e.preventDefault();
          if (r.kind === 'wrong') setWrong(true);
          if (r.kind === 'ok') setWrong(false);
          setTyped(recorder.typed);
        }}
        onKeyUp={(e) => {
          recorder.keyUp({ code: e.code, timeStamp: e.timeStamp });
          const done = recorder.complete();
          if (done) {
            recorder.reset();
            setTyped(0);
            onSample(done);
          }
        }}
      />
      {wrong && <Notice tone="caution">{t('keystroke.wrongKey')}</Notice>}
      {touch && <Notice tone="info">{t('keystroke.touch')}</Notice>}
    </div>
  );
}
