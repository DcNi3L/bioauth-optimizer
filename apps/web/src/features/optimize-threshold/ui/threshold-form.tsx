'use client';

import type { ReactNode } from 'react';

import { useT } from '@/shared/i18n';
import { NumberField, Segmented } from '@/shared/ui';

import type { FieldErrors, ThresholdFormValues, ThresholdMode } from '../model/use-threshold-form';

interface Props {
  values: ThresholdFormValues;
  errors: FieldErrors;
  set: <K extends keyof ThresholdFormValues>(key: K, value: ThresholdFormValues[K]) => void;
  /** Блок загрузки данных (фича upload-scores) — подставляется страницей. */
  datasetSlot: ReactNode;
}

export function ThresholdForm({ values, errors, set, datasetSlot }: Props) {
  const t = useT();

  const MODES = [
    { value: 'gaussian', label: t('algo.threshold.sourceGaussian') },
    { value: 'empirical', label: t('algo.threshold.sourceEmpirical') },
  ] as const;

  const bind = (key: Exclude<keyof ThresholdFormValues, 'mode'>) => ({
    value: values[key],
    error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  return (
    <div className="flex flex-col gap-6">
      <Segmented
        label={t('algo.threshold.source')}
        value={values.mode}
        options={MODES}
        onChange={(m: ThresholdMode) => set('mode', m)}
      />

      {values.mode === 'gaussian' ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="flex min-w-0 flex-col gap-3 border-l-2 border-frr pl-4">
            <legend className="mb-2 text-sm font-medium text-frr">{t('algo.threshold.genuine')}</legend>
            <NumberField label={t('algo.threshold.meanG')} {...bind('genuineMean')} />
            <NumberField label={t('algo.threshold.stdG')} {...bind('genuineStd')} />
          </fieldset>
          <fieldset className="flex min-w-0 flex-col gap-3 border-l-2 border-far pl-4">
            <legend className="mb-2 text-sm font-medium text-far">{t('algo.threshold.impostors')}</legend>
            <NumberField label={t('algo.threshold.meanI')} {...bind('impostorMean')} />
            <NumberField label={t('algo.threshold.stdI')} {...bind('impostorStd')} />
          </fieldset>
          <p className="text-xs text-graphite sm:col-span-2">{t('algo.threshold.gaussianNote')}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {datasetSlot}
          {errors.dataset && <p className="text-xs text-far">{errors.dataset}</p>}
        </div>
      )}

      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">{t('algo.threshold.costsLegend')}</legend>
        <NumberField
          label={t('algo.threshold.cFALabel')}
          hint={t('algo.threshold.cFAHint')}
          {...bind('cFA')}
        />
        <NumberField
          label={t('algo.threshold.cFRLabel')}
          hint={t('algo.threshold.cFRHint')}
          {...bind('cFR')}
        />
        <NumberField
          label={t('algo.threshold.farMaxLabel')}
          placeholder={t('algo.threshold.farMaxPlaceholder')}
          hint={t('algo.threshold.farMaxHint')}
          {...bind('farMax')}
        />
      </fieldset>

      <details className="text-sm">
        <summary className="cursor-pointer text-graphite">{t('algo.threshold.curveRange')}</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NumberField
            label={t('algo.threshold.curveFrom')}
            placeholder={t('algo.threshold.curveAuto')}
            {...bind('curveFrom')}
          />
          <NumberField
            label={t('algo.threshold.curveTo')}
            placeholder={t('algo.threshold.curveAuto')}
            {...bind('curveTo')}
          />
        </div>
      </details>
    </div>
  );
}
