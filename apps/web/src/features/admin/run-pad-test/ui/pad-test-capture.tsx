'use client';

import type { AttackType } from '@bioauth/contracts';
import { useState } from 'react';

import { FaceViewport } from '@/entities/face';
import { formatNumber } from '@/shared/lib';
import { type CapturedFrame, grabFrame, sleep, useCamera } from '@/shared/lib/camera';
import { ApiErrorNotice, Button, Notice, Segmented, SelectField } from '@/shared/ui';

import { useRecordPadSample } from '../api/record';

const FRAMES = 4;

export const ATTACK_LABELS: Record<AttackType, string> = {
  print: 'Печатное фото',
  screen: 'Фото на экране',
  video: 'Видео на экране',
  mask: 'Маска',
  other: 'Другое',
};

type Kind = 'bonafide' | 'attack';

/**
 * Испытание PAD (UC-8, ISO/IEC 30107-3): оператор выбирает, что предъявляется, — живой человек или атака
 * указанного вида — и снимает 4 кадра. Результат идёт в отчёт APCER/BPCER и в калибровку τ_pad.
 */
export function PadTestCapture() {
  const { videoRef, state, start } = useCamera();
  const record = useRecordPadSample();
  const [kind, setKind] = useState<Kind>('bonafide');
  const [attackType, setAttackType] = useState<AttackType>('print');
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);

  async function capture() {
    const video = videoRef.current;
    if (!video) return;
    setBusy(true);
    record.reset();
    try {
      const frames: CapturedFrame[] = [];
      for (let i = 0; i < FRAMES; i++) {
        frames.push(grabFrame(video));
        await sleep(250);
      }
      await record.mutateAsync({
        label: kind === 'bonafide' ? { kind } : { kind, attackType },
        frames,
      });
      setCount((c) => c + 1);
    } catch {
      // ошибку показывает ApiErrorNotice
    } finally {
      setBusy(false);
    }
  }

  const r = record.data;
  return (
    <div className="flex flex-col gap-4">
      <FaceViewport
        videoRef={videoRef}
        state={state}
        prompt={
          kind === 'bonafide'
            ? 'Предъявляется живой участник'
            : `Атака: ${ATTACK_LABELS[attackType].toLowerCase()}`
        }
      />
      <Segmented<Kind>
        label="Что предъявляется"
        value={kind}
        onChange={setKind}
        options={[
          { value: 'bonafide', label: 'Подлинное' },
          { value: 'attack', label: 'Атака' },
        ]}
      />
      {kind === 'attack' && (
        <SelectField
          label="Вид атаки (PAI)"
          value={attackType}
          onChange={(e) => setAttackType(e.target.value as AttackType)}
        >
          {Object.entries(ATTACK_LABELS).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </SelectField>
      )}
      <div className="flex flex-wrap gap-2">
        {state !== 'ready' ? (
          <Button onClick={() => void start()} busy={state === 'starting'}>
            Включить камеру
          </Button>
        ) : (
          <Button onClick={() => void capture()} busy={busy}>
            Записать предъявление
          </Button>
        )}
      </div>
      <ApiErrorNotice error={record.error} />
      {r && (
        <Notice
          tone={r.detectedAsLive === (kind === 'bonafide') ? 'success' : 'caution'}
          title={`Записано предъявлений: ${count}`}
        >
          p_live = <span className="num">{formatNumber(r.pLive, 3)}</span> — система сочла предъявление{' '}
          {r.detectedAsLive ? 'живым' : 'атакой'} при текущем пороге τ_pad.
        </Notice>
      )}
    </div>
  );
}
