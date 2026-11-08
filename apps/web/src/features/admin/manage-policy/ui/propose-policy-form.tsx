'use client';

import type { CostsDto, FaceStep } from '@bioauth/contracts';
import { useState } from 'react';

import { useT } from '@/shared/i18n';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, Checkbox, Notice, NumberField, TextField } from '@/shared/ui';

import { useProposePolicy } from '../api/policy';

/** Ручное предложение политики (калибровка предлагает автоматически). Правила АРРФР: не менее трёх команд. */
export function ProposePolicyForm({
  face,
  costs,
  passkey,
}: {
  face: FaceStep;
  costs: CostsDto;
  passkey: boolean;
}) {
  const t = useT();
  const propose = useProposePolicy();
  const [tauFace, setTauFace] = useState(String(face.tauFace));
  const [tauPad, setTauPad] = useState(String(face.tauPad));
  const [commands, setCommands] = useState(String(face.commands));
  const [withPasskey, setWithPasskey] = useState(passkey);
  const [cFA, setCFA] = useState(String(costs.cFA));
  const [cFR, setCFR] = useState(String(costs.cFR));
  const [rationale, setRationale] = useState('');
  const v = {
    tauFace: parseNumber(tauFace),
    tauPad: parseNumber(tauPad),
    commands: parseNumber(commands),
    cFA: parseNumber(cFA),
    cFR: parseNumber(cFR),
  };
  const valid = Object.values(v).every((x) => x !== null) && Number.isInteger(v.commands);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField
          label={t('algo.policies.tauFace')}
          value={tauFace}
          onChange={(e) => setTauFace(e.target.value)}
        />
        <NumberField
          label={t('algo.policies.tauPad')}
          value={tauPad}
          onChange={(e) => setTauPad(e.target.value)}
        />
        <NumberField
          label={t('algo.policies.commands')}
          value={commands}
          onChange={(e) => setCommands(e.target.value)}
        />
        <NumberField label="cFA" value={cFA} onChange={(e) => setCFA(e.target.value)} />
        <NumberField label="cFR" value={cFR} onChange={(e) => setCFR(e.target.value)} />
      </div>
      {v.commands !== null && v.commands < 3 && <Notice tone="caution">{t('algo.policies.arrfr')}</Notice>}
      <Checkbox
        label={t('algo.policies.passkeyStep')}
        checked={withPasskey}
        onChange={(e) => setWithPasskey(e.target.checked)}
      />
      <TextField
        label={t('algo.policies.rationale')}
        value={rationale}
        onChange={(e) => setRationale(e.target.value)}
      />
      <ApiErrorNotice error={propose.error} />
      {propose.isSuccess && (
        <Notice tone="success">{t('algo.policies.proposed', { version: propose.data.version })}</Notice>
      )}
      <div>
        <Button
          disabled={!valid}
          busy={propose.isPending}
          onClick={() =>
            propose.mutate({
              steps: [
                {
                  factor: 'face',
                  tauFace: v.tauFace!,
                  tauPad: v.tauPad!,
                  commands: v.commands!,
                  calibrated: false,
                },
                ...(withPasskey ? [{ factor: 'passkey' as const }] : []),
              ],
              costs: { cFA: v.cFA!, cFR: v.cFR! },
              rationale: rationale.trim() || null,
            })
          }
        >
          {t('algo.policies.propose')}
        </Button>
      </div>
    </div>
  );
}
