'use client';

import type {
  CalibrateResponseDto,
  CalibrationDataDto,
  CalibrationModality,
  CostsDto,
} from '@bioauth/contracts';
import { useEffect, useMemo, useState } from 'react';

import { useT } from '@/shared/i18n';
import { parseNumber } from '@/shared/lib';
import { ApiErrorNotice, Button, NumberField, Segmented, SelectField } from '@/shared/ui';

import { useCalibrate } from '../api/calibrate';

/** Параметры калибровки: модальность, версия модели (оценки разных версий не смешиваются), стоимости, целевой FAR. */
export function CalibrateForm({
  data,
  costs,
  onResult,
}: {
  data: CalibrationDataDto[];
  costs: CostsDto;
  onResult: (r: CalibrateResponseDto) => void;
}) {
  const t = useT();
  const calibrate = useCalibrate();
  const [modality, setModality] = useState<CalibrationModality>('face');
  const versions = useMemo(() => data.filter((d) => d.modality === modality), [data, modality]);
  const [modelVersion, setModelVersion] = useState('');
  const [cFA, setCFA] = useState(String(costs.cFA));
  const [cFR, setCFR] = useState(String(costs.cFR));
  const [targetFar, setTargetFar] = useState('1e-3');
  useEffect(() => setModelVersion(versions[0]?.modelVersion ?? ''), [versions]);

  const fa = parseNumber(cFA);
  const fr = parseNumber(cFR);
  const target = parseNumber(targetFar);
  const valid =
    modelVersion !== '' &&
    fa !== null &&
    fa > 0 &&
    fr !== null &&
    fr > 0 &&
    target !== null &&
    target > 0 &&
    target < 1;
  const current = versions.find((v) => v.modelVersion === modelVersion);
  return (
    <div className="flex flex-col gap-4">
      <Segmented<CalibrationModality>
        label={t('algo.calibration.what')}
        value={modality}
        onChange={setModality}
        options={[
          { value: 'face', label: t('algo.calibration.tauFace') },
          { value: 'pad', label: t('algo.calibration.tauPad') },
          { value: 'keystroke', label: t('algo.calibration.tauKd') },
        ]}
      />
      <SelectField
        label={t('algo.calibration.modelVersion')}
        value={modelVersion}
        onChange={(e) => setModelVersion(e.target.value)}
        hint={
          current
            ? t(modality === 'pad' ? 'algo.calibration.countsPad' : 'algo.calibration.countsFace', {
                pos: current.positives,
                neg: current.negatives,
              })
            : t('algo.calibration.noScores')
        }
      >
        {versions.length === 0 && <option value="">—</option>}
        {versions.map((v) => (
          <option key={v.modelVersion} value={v.modelVersion}>
            {v.modelVersion}
          </option>
        ))}
      </SelectField>
      <div className="grid gap-4 sm:grid-cols-3">
        <NumberField label={t('algo.calibration.cFA')} value={cFA} onChange={(e) => setCFA(e.target.value)} />
        <NumberField label={t('algo.calibration.cFR')} value={cFR} onChange={(e) => setCFR(e.target.value)} />
        <NumberField
          label={t('algo.calibration.targetFar')}
          value={targetFar}
          onChange={(e) => setTargetFar(e.target.value)}
          hint={t('algo.calibration.targetFarHint')}
        />
      </div>
      <ApiErrorNotice error={calibrate.error} />
      <div>
        <Button
          disabled={!valid}
          busy={calibrate.isPending}
          onClick={() =>
            calibrate.mutate(
              { modality, modelVersion, costs: { cFA: fa!, cFR: fr! }, targetFar: target! },
              { onSuccess: onResult },
            )
          }
        >
          {t('algo.calibration.calculate')}
        </Button>
      </div>
    </div>
  );
}
