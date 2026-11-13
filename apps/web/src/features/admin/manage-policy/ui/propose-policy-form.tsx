'use client';

import type { CostsDto, FaceStep, PolicyFactor, PolicyStep } from '@bioauth/contracts';
import { useState } from 'react';

import { type TKey, useT } from '@/shared/i18n';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, Notice, NumberField, SelectField, TextField } from '@/shared/ui';

import { useProposePolicy } from '../api/policy';

const FACTOR_LABEL: Record<PolicyFactor, TKey> = {
  face: 'algo.policies.factorFace',
  passkey: 'algo.policies.factorPasskey',
  totp: 'algo.policies.factorTotp',
  keystroke: 'algo.policies.factorKeystroke',
};
const FACTORS = Object.keys(FACTOR_LABEL) as PolicyFactor[];
const DEFAULT_FACE: FaceStep = {
  factor: 'face',
  tauFace: 0.363,
  tauPad: 0.5,
  commands: 3,
  calibrated: false,
};

/**
 * Ручное предложение политики (калибровка предлагает автоматически): один или два шага из четырёх факторов (#48).
 * Правила АРРФР для лица: не менее трёх команд.
 */
export function ProposePolicyForm({
  steps: current,
  costs,
}: {
  steps: readonly PolicyStep[];
  costs: CostsDto;
}) {
  const t = useT();
  const propose = useProposePolicy();
  const face = current.find((s): s is FaceStep => s.factor === 'face') ?? DEFAULT_FACE;
  const kd = current.find((s) => s.factor === 'keystroke');
  const [first, setFirst] = useState<PolicyFactor>(current[0]?.factor ?? 'face');
  const [second, setSecond] = useState<PolicyFactor | ''>(current[1]?.factor ?? '');
  const [tauFace, setTauFace] = useState(String(face.tauFace));
  const [tauPad, setTauPad] = useState(String(face.tauPad));
  const [commands, setCommands] = useState(String(face.commands));
  const [tauKd, setTauKd] = useState(String(kd?.factor === 'keystroke' ? kd.tauKd : 1.1));
  const [cFA, setCFA] = useState(String(costs.cFA));
  const [cFR, setCFR] = useState(String(costs.cFR));
  const [rationale, setRationale] = useState('');
  const chosen = second && second !== first ? [first, second] : [first];
  const hasFace = chosen.includes('face');
  const hasKd = chosen.includes('keystroke');
  const v = {
    tauFace: parseNumber(tauFace),
    tauPad: parseNumber(tauPad),
    commands: parseNumber(commands),
    tauKd: parseNumber(tauKd),
    cFA: parseNumber(cFA),
    cFR: parseNumber(cFR),
  };
  const valid =
    v.cFA !== null &&
    v.cFR !== null &&
    (!hasFace ||
      (v.tauFace !== null && v.tauPad !== null && v.commands !== null && Number.isInteger(v.commands))) &&
    (!hasKd || (v.tauKd !== null && v.tauKd >= 0.2 && v.tauKd <= 4));

  const build = (f: PolicyFactor): PolicyStep => {
    switch (f) {
      case 'face':
        return {
          factor: 'face',
          tauFace: v.tauFace!,
          tauPad: v.tauPad!,
          commands: v.commands!,
          calibrated: false,
        };
      case 'keystroke':
        return { factor: 'keystroke', tauKd: v.tauKd!, calibrated: false };
      case 'passkey':
      case 'totp':
        return { factor: f };
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <SelectField
          label={t('algo.policies.step1')}
          value={first}
          onChange={(e) => setFirst(e.target.value as PolicyFactor)}
        >
          {FACTORS.map((f) => (
            <option key={f} value={f}>
              {t(FACTOR_LABEL[f])}
            </option>
          ))}
        </SelectField>
        <SelectField
          label={t('algo.policies.step2')}
          value={second}
          onChange={(e) => setSecond(e.target.value as PolicyFactor | '')}
        >
          <option value="">{t('algo.policies.noStep')}</option>
          {FACTORS.filter((f) => f !== first).map((f) => (
            <option key={f} value={f}>
              {t(FACTOR_LABEL[f])}
            </option>
          ))}
        </SelectField>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        {hasFace && (
          <>
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
          </>
        )}
        {hasKd && (
          <NumberField
            label={t('algo.policies.tauKd')}
            hint={t('algo.policies.tauKdHint')}
            value={tauKd}
            onChange={(e) => setTauKd(e.target.value)}
          />
        )}
        <NumberField label="cFA" value={cFA} onChange={(e) => setCFA(e.target.value)} />
        <NumberField label="cFR" value={cFR} onChange={(e) => setCFR(e.target.value)} />
      </div>
      {hasFace && v.commands !== null && v.commands < 3 && (
        <Notice tone="caution">{t('algo.policies.arrfr')}</Notice>
      )}
      {!hasFace && <Notice tone="info">{t('algo.policies.noCamera')}</Notice>}
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
              steps: chosen.map(build),
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
