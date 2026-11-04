'use client';

import type { ReactNode } from 'react';

import { NumberField, Segmented } from '@/shared/ui';

import type { FieldErrors, ThresholdFormValues, ThresholdMode } from '../model/use-threshold-form';

const MODES = [
  { value: 'gaussian', label: 'Нормальные распределения' },
  { value: 'empirical', label: 'Свои оценки (CSV)' },
] as const;

interface Props {
  values: ThresholdFormValues;
  errors: FieldErrors;
  set: <K extends keyof ThresholdFormValues>(key: K, value: ThresholdFormValues[K]) => void;
  /** Блок загрузки данных (фича upload-scores) — подставляется страницей. */
  datasetSlot: ReactNode;
}

export function ThresholdForm({ values, errors, set, datasetSlot }: Props) {
  const bind = (key: Exclude<keyof ThresholdFormValues, 'mode'>) => ({
    value: values[key],
    error: errors[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => set(key, e.target.value),
  });

  return (
    <div className="flex flex-col gap-6">
      <Segmented
        label="Источник оценок"
        value={values.mode}
        options={MODES}
        onChange={(m: ThresholdMode) => set('mode', m)}
      />

      {values.mode === 'gaussian' ? (
        <div className="grid gap-5 sm:grid-cols-2">
          <fieldset className="border-frr flex min-w-0 flex-col gap-3 border-l-2 pl-4">
            <legend className="text-frr mb-2 text-sm font-medium">Законные пользователи</legend>
            <NumberField label="Среднее оценки μ_G" {...bind('genuineMean')} />
            <NumberField label="Отклонение σ_G" {...bind('genuineStd')} />
          </fieldset>
          <fieldset className="border-far flex min-w-0 flex-col gap-3 border-l-2 pl-4">
            <legend className="text-far mb-2 text-sm font-medium">Злоумышленники</legend>
            <NumberField label="Среднее оценки μ_I" {...bind('impostorMean')} />
            <NumberField label="Отклонение σ_I" {...bind('impostorStd')} />
          </fieldset>
          <p className="text-graphite text-xs sm:col-span-2">
            Оценки сходства каждой группы считаются нормально распределёнными: s ~ N(μ, σ), σ — стандартное
            отклонение.
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {datasetSlot}
          {errors.dataset && <p className="text-far text-xs">{errors.dataset}</p>}
        </div>
      )}

      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-sm font-medium">Стоимость ошибок и ограничение</legend>
        <NumberField label="Ложный допуск, cFA" hint="Цена пропуска злоумышленника" {...bind('cFA')} />
        <NumberField label="Ложный отказ, cFR" hint="Цена отказа законному" {...bind('cFR')} />
        <NumberField
          label="FAR не выше"
          placeholder="без ограничения"
          hint="Например, 1e-4"
          {...bind('farMax')}
        />
      </fieldset>

      <details className="text-sm">
        <summary className="text-graphite cursor-pointer">Диапазон графика</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-2">
          <NumberField label="τ от" placeholder="авто" {...bind('curveFrom')} />
          <NumberField label="τ до" placeholder="авто" {...bind('curveTo')} />
        </div>
      </details>
    </div>
  );
}
