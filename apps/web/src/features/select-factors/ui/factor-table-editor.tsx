'use client';

import type { FactorDraft } from '@/entities/factor';
import { Button } from '@/shared/ui';

import type { FactorSelectionFormState } from '../model/use-factor-selection-form';

const cell =
  'num h-9 w-full min-w-0 rounded border bg-sheet px-2 text-sm outline-none focus:border-frr aria-[invalid=true]:border-far';

const COLUMNS: {
  key: keyof Omit<FactorDraft, 'key' | 'hasPad'>;
  label: string;
  width: string;
  placeholder?: string;
}[] = [
  { key: 'code', label: 'Код', width: 'w-20' },
  { key: 'name', label: 'Фактор', width: 'min-w-44' },
  { key: 'far', label: 'FAR', width: 'w-28', placeholder: '1e-4' },
  { key: 'frr', label: 'FRR', width: 'w-24', placeholder: '0,02' },
  { key: 'latencyMs', label: 'Задержка, мс', width: 'w-28' },
  { key: 'cost', label: 'Стоимость', width: 'w-24' },
];

/** Редактируемая таблица факторов; ошибки валидации показываются в ячейках. */
export function FactorTableEditor({ form }: { form: FactorSelectionFormState }) {
  const { factors, errors, updateFactor, removeFactor, addFactor } = form;
  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-x-auto">
        <table className="data-table">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.width}>
                  {c.label}
                </th>
              ))}
              <th className="w-16">PAD</th>
              <th className="w-10">
                <span className="sr-only">Удалить</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {factors.map((f, i) => (
              <tr key={f.key}>
                {COLUMNS.map((c) => {
                  const error = errors[`factors.${i}.${c.key}`];
                  return (
                    <td key={c.key} className="!px-1.5">
                      <input
                        aria-label={`${c.label}, строка ${i + 1}`}
                        aria-invalid={!!error}
                        title={error}
                        className={`${cell} ${error ? 'border-far' : 'border-rule'}`}
                        value={f[c.key]}
                        placeholder={c.placeholder}
                        inputMode={c.key === 'code' || c.key === 'name' ? 'text' : 'decimal'}
                        onChange={(e) => updateFactor(f.key, { [c.key]: e.target.value })}
                      />
                    </td>
                  );
                })}
                <td className="!px-1.5 text-center">
                  <input
                    type="checkbox"
                    aria-label={`PAD, строка ${i + 1}`}
                    className="accent-ink size-4"
                    checked={f.hasPad}
                    onChange={(e) => updateFactor(f.key, { hasPad: e.target.checked })}
                  />
                </td>
                <td className="!px-1.5">
                  <button
                    type="button"
                    onClick={() => removeFactor(f.key)}
                    disabled={factors.length === 1}
                    aria-label={`Удалить фактор ${f.code || i + 1}`}
                    className="text-graphite hover:bg-paper hover:text-far rounded px-2 py-1 disabled:opacity-30"
                  >
                    ✕
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {Object.entries(errors)
        .filter(([p]) => p.startsWith('factors.'))
        .slice(0, 3)
        .map(([p, m]) => (
          <p key={p} className="text-far text-xs">
            Строка {Number(p.split('.')[1]) + 1}: {m}
          </p>
        ))}
      {errors.factors && <p className="text-far text-xs">{errors.factors}</p>}
      <div>
        <Button variant="secondary" onClick={addFactor} disabled={factors.length >= 50}>
          Добавить фактор
        </Button>
      </div>
    </div>
  );
}
