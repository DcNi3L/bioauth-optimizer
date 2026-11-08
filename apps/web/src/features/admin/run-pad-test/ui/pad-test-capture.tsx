'use client';

import type { AttackType } from '@bioauth/contracts';
import { useState } from 'react';

import { FaceViewport } from '@/entities/face';
import type { TKey } from '@/shared/i18n';
import { useT } from '@/shared/i18n';
import { formatNumber } from '@/shared/lib';
import { type CapturedFrame, grabFrame, sleep, useCamera } from '@/shared/lib/camera';
import { ApiErrorNotice, Button, Notice, Segmented, SelectField } from '@/shared/ui';

import { useRecordPadSample } from '../api/record';

const FRAMES = 4;

const ATTACK_KEY: Record<AttackType, TKey> = {
  print: 'algo.pad.print',
  screen: 'algo.pad.screen',
  video: 'algo.pad.video',
  mask: 'algo.pad.mask',
  other: 'algo.pad.other',
};

type Kind = 'bonafide' | 'attack';

/**
 * Испытание PAD (UC-8, ISO/IEC 30107-3): оператор выбирает, что предъявляется, — живой человек или атака
 * указанного вида — и снимает 4 кадра. Результат идёт в отчёт APCER/BPCER и в калибровку τ_pad.
 */
export function PadTestCapture() {
  const t = useT();
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
            ? t('algo.pad.livePrompt')
            : t('algo.pad.attackPrompt', { kind: t(ATTACK_KEY[attackType]) })
        }
      />
      <Segmented<Kind>
        label={t('algo.pad.whatShown')}
        value={kind}
        onChange={setKind}
        options={[
          { value: 'bonafide', label: t('algo.pad.bonafide') },
          { value: 'attack', label: t('algo.pad.attack') },
        ]}
      />
      {kind === 'attack' && (
        <SelectField
          label={t('algo.pad.attackType')}
          value={attackType}
          onChange={(e) => setAttackType(e.target.value as AttackType)}
        >
          {Object.entries(ATTACK_KEY).map(([v, key]) => (
            <option key={v} value={v}>
              {t(key)}
            </option>
          ))}
        </SelectField>
      )}
      <div className="flex flex-wrap gap-2">
        {state !== 'ready' ? (
          <Button onClick={() => void start()} busy={state === 'starting'}>
            {t('algo.pad.cameraOn')}
          </Button>
        ) : (
          <Button onClick={() => void capture()} busy={busy}>
            {t('algo.pad.record')}
          </Button>
        )}
      </div>
      <ApiErrorNotice error={record.error} />
      {r && (
        <Notice
          tone={r.detectedAsLive === (kind === 'bonafide') ? 'success' : 'caution'}
          title={t('algo.pad.recordedTitle', { n: count })}
        >
          p_live = <span className="num">{formatNumber(r.pLive, 3)}</span> —{' '}
          {t('algo.pad.judged', {
            how: r.detectedAsLive ? t('algo.pad.judgedLive') : t('algo.pad.judgedAttack'),
          })}
        </Notice>
      )}
    </div>
  );
}
