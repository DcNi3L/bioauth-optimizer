'use client';

import type { FactorDraft } from '@/entities/factor';
import { useT } from '@/shared/i18n';
import { Button } from '@/shared/ui';

import type { FactorSelectionFormState } from '../model/use-factor-selection-form';

const cell =
  'num h-9 w-full min-w-0 rounded border bg-sheet px-2 text-sm outline-none focus:border-frr aria-[invalid=true]:border-far';

/** Редактируемая таблица факторов; ошибки валидации показываются в ячейках. */
export function FactorTableEditor({ form }: { form: FactorSelectionFormState }) {
  const t = useT();
  const { factors, errors, updateFactor, removeFactor, addFactor } = form;

  type ColKey = keyof Omit<FactorDraft, 'key' | 'hasPad'>;
  const COLUMNS: { key: ColKey; label: string; width: string; placeholder?: string }[] = [
    { key: 'code', label: t('algo.factors.colCode'), width: 'w-20' },
    { key: 'name', label: t('algo.factors.colName'), width: 'min-w-44' },
    { key: 'far', label: t('algo.factors.colFAR'), width: 'w-28', placeholder: '1e-4' },
    { key: 'frr', label: t('algo.factors.colFRR'), width: 'w-24', placeholder: '0,02' },
    { key: 'latencyMs', label: t('algo.factors.colLatency'), width: 'w-28' },
    { key: 'cost', label: t('algo.factors.colCost'), width: 'w-24' },
  ];

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-x-auto">
        <table className="data-table min-w-[640px]">
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} className={c.width}>
                  {c.label}
                </th>
              ))}
              <th className="w-16">{t('algo.factors.colPAD')}</th>
              <th className="w-10">
                <span className="sr-only">Delete</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {factors.map((f, i) => (
              <tr key={f.key}>
                {COLUMNS.map((c) => {
                  const error = errors[`factors.${i}.${c.key}`];
                  return (
                    <td key={c.key} className="px-1.5!">
                      <input
                        aria-label={`${c.label}, ${i + 1}`}
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
                <td className="px-1.5! text-center">
                  <input
                    type="checkbox"
                    aria-label={`PAD, ${i + 1}`}
                    className="accent-ink size-4"
                    checked={f.hasPad}
                    onChange={(e) => updateFactor(f.key, { hasPad: e.target.checked })}
                  />
                </td>
                <td className="px-1.5!">
                  <button
                    type="button"
                    onClick={() => removeFactor(f.key)}
                    disabled={factors.length === 1}
                    aria-label={`Delete factor ${f.code || i + 1}`}
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
            {Number(p.split('.')[1]) + 1}: {m}
          </p>
        ))}
      {errors.factors && <p className="text-far text-xs">{errors.factors}</p>}
      <div>
        <Button variant="secondary" onClick={addFactor} disabled={factors.length >= 50}>
          {t('algo.factors.addFactor')}
        </Button>
      </div>
    </div>
  );
}
