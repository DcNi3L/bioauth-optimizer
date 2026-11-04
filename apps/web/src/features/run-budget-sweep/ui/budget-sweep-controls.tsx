'use client';

import { useState } from 'react';
import type { BudgetSweepRequest } from '@bioauth/contracts';
import { parseNumber } from '@/shared/lib';
import { Button, NumberField } from '@/shared/ui';

/** Диапазон бюджета для анализа чувствительности; основа запроса берётся из формы факторов. */
export function BudgetSweepControls({
  buildBase,
  onRun,
  busy,
}: {
  buildBase: () => Omit<BudgetSweepRequest, 'sweep'> | null;
  onRun: (req: BudgetSweepRequest) => void;
  busy: boolean;
}) {
  const [from, setFrom] = useState('0,5');
  const [to, setTo] = useState('3');
  const [step, setStep] = useState('0,1');
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const f = parseNumber(from);
    const t = parseNumber(to);
    const s = parseNumber(step);
    if (f === null || t === null || s === null || [f, t, s].some(Number.isNaN)) return setError('Заполните диапазон числами');
    if (t < f) return setError('Конец диапазона должен быть не меньше начала');
    if (s <= 0) return setError('Шаг должен быть больше нуля');
    if (Math.floor((t - f) / s + 1e-9) + 1 > 500) return setError('Слишком много точек: не более 500');
    const base = buildBase();
    if (!base) return setError('Исправьте ошибки в факторах и ограничениях выше');
    setError(null);
    onRun({ ...base, sweep: { from: f, to: t, step: s } });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <NumberField label="Бюджет от" value={from} onChange={(e) => setFrom(e.target.value)} />
        <NumberField label="до" value={to} onChange={(e) => setTo(e.target.value)} />
        <NumberField label="шаг" value={step} onChange={(e) => setStep(e.target.value)} />
        <Button onClick={run} busy={busy}>
          Построить
        </Button>
      </div>
      {error && <p className="text-xs text-far">{error}</p>}
    </div>
  );
}
