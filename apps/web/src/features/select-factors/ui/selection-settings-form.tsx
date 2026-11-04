'use client';

import { NumberField, SelectField } from '@/shared/ui';
import type { FactorSelectionFormState, SelectionSettings, SolverMode } from '../model/use-factor-selection-form';

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
  const { settings, errors, setSetting } = form;
  const bind = (key: Exclude<keyof SelectionSettings, 'solver'>) => ({
    value: settings[key],
    error: errors[PATH[key]!],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setSetting(key, e.target.value),
  });
  return (
    <div className="flex flex-col gap-5">
      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Стоимость ошибок</legend>
        <NumberField label="Ложный допуск, cFA" {...bind('cFA')} />
        <NumberField label="Ложный отказ, cFR" {...bind('cFR')} />
      </fieldset>
      <fieldset className="grid min-w-0 gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-sm font-medium">Ограничения</legend>
        <NumberField label="Задержка не более, мс" placeholder="без ограничения" {...bind('latencyMaxMs')} />
        <NumberField label="Бюджет B не более" placeholder="без ограничения" {...bind('budget')} />
        <NumberField label="FAR набора не выше" placeholder="без ограничения" {...bind('farMax')} />
        <NumberField label="Факторов с PAD, не меньше" inputMode="numeric" {...bind('minPadFactors')} />
      </fieldset>
      <SelectField
        label="Метод решения"
        value={settings.solver}
        onChange={(e) => setSetting('solver', e.target.value as SolverMode)}
        hint={
          settings.solver === 'ilp'
            ? 'Линеаризованное ЦЛП из СРО1 с доказательством оптимальности'
            : settings.solver === 'exhaustive'
              ? 'Все 2ⁿ − 1 наборов, до 20 факторов'
              : 'До 20 факторов — полный перебор, больше — ЦЛП'
        }
      >
        <option value="auto">Автоматически</option>
        <option value="exhaustive">Полный перебор</option>
        <option value="ilp">Целочисленное программирование (HiGHS)</option>
      </SelectField>
    </div>
  );
}
