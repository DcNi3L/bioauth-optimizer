'use client';

import { useT } from '@/shared/i18n';
import { NumberField, SelectField } from '@/shared/ui';

import type {
  FactorSelectionFormState,
  SelectionSettings,
  SolverMode,
} from '../model/use-factor-selection-form';

const PATH: Partial<Record<keyof SelectionSettings, string>> = {
  cFA: 'costs.cFA',
  cFR: 'costs.cFR',
  latencyMaxMs: 'constraints.latencyMaxMs',
  budget: 'constraints.budget',
  farMax: 'constraints.farMax',
  minPadFactors: 'constraints.minPadFactors',
};

/** Стоимости ошибок, ограничения (3) СРО1 и выбор решателя. */
export function SelectionSettingsForm({ form }: { form: FactorSelectionFormState }) {
  const t = useT();
  const { settings, errors, setSetting } = form;
  const bind = (key: Exclude<keyof SelectionSettings, 'solver'>) => ({
    value: settings[key],
    error: errors[PATH[key]!],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSetting(key, e.target.value),
  });

  const solverHint =
    settings.solver === 'ilp'
      ? t('algo.factors.solverIlpHint')
      : settings.solver === 'exhaustive'
        ? t('algo.factors.solverExhaustiveHint')
        : t('algo.factors.solverAutoHint');

  return (
    <div className="flex flex-col gap-5">
      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t('algo.factors.costsLegend')}</legend>
        <NumberField label={t('algo.threshold.cFALabel')} {...bind('cFA')} />
        <NumberField label={t('algo.threshold.cFRLabel')} {...bind('cFR')} />
      </fieldset>
      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">{t('algo.factors.constraintsLegend')}</legend>
        <NumberField
          label={t('algo.factors.latencyMax')}
          placeholder={t('algo.factors.noLimit')}
          {...bind('latencyMaxMs')}
        />
        <NumberField
          label={t('algo.factors.budget')}
          placeholder={t('algo.factors.noLimit')}
          {...bind('budget')}
        />
        <NumberField
          label={t('algo.factors.farMaxConstraint')}
          placeholder={t('algo.factors.noLimit')}
          {...bind('farMax')}
        />
        <NumberField label={t('algo.factors.minPadFactors')} inputMode="numeric" {...bind('minPadFactors')} />
      </fieldset>
      <SelectField
        label={t('algo.factors.solverLabel')}
        value={settings.solver}
        onChange={(e) => setSetting('solver', e.target.value as SolverMode)}
        hint={solverHint}
      >
        <option value="auto">{t('algo.factors.solverAuto')}</option>
        <option value="exhaustive">{t('algo.factors.solverExhaustive')}</option>
        <option value="ilp">{t('algo.factors.solverIlp')}</option>
      </SelectField>
    </div>
  );
}
