'use client';

import type { BudgetSweepRequest } from '@bioauth/contracts';
import { useState } from 'react';

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
    if (f === null || t === null || s === null || [f, t, s].some(Number.isNaN)) {
      setError('Заполните диапазон числами');
      return;
    }
    if (t < f) {
      setError('Конец диапазона должен быть не меньше начала');
      return;
    }
    if (s <= 0) {
      setError('Шаг должен быть больше нуля');
      return;
    }
    if (Math.floor((t - f) / s + 1e-9) + 1 > 500) {
      setError('Слишком много точек: не более 500');
      return;
    }
    const base = buildBase();
    if (!base) {
      setError('Исправьте ошибки в факторах и ограничениях выше');
      return;
    }
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
      {error && <p className="text-far text-xs">{error}</p>}
    </div>
  );
}
