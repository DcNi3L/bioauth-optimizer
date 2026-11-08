'use client';

import type { BudgetSweepRequest } from '@bioauth/contracts';
import { useState } from 'react';

import { useT } from '@/shared/i18n';
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
  const t = useT();
  const [from, setFrom] = useState('0,5');
  const [to, setTo] = useState('3');
  const [step, setStep] = useState('0,1');
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    const f = parseNumber(from);
    const tVal = parseNumber(to);
    const s = parseNumber(step);
    if (f === null || tVal === null || s === null || [f, tVal, s].some(Number.isNaN)) {
      setError(t('algo.factors.sweepErrNumbers'));
      return;
    }
    if (tVal < f) {
      setError(t('algo.factors.sweepErrEndGtStart'));
      return;
    }
    if (s <= 0) {
      setError(t('algo.factors.sweepErrStepPositive'));
      return;
    }
    if (Math.floor((tVal - f) / s + 1e-9) + 1 > 500) {
      setError(t('algo.factors.sweepErrTooMany'));
      return;
    }
    const base = buildBase();
    if (!base) {
      setError(t('algo.factors.sweepErrBase'));
      return;
    }
    setError(null);
    onRun({ ...base, sweep: { from: f, to: tVal, step: s } });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="grid gap-4 sm:grid-cols-[1fr_1fr_1fr_auto] sm:items-end">
        <NumberField
          label={t('algo.factors.sweepFrom')}
          value={from}
          onChange={(e) => setFrom(e.target.value)}
        />
        <NumberField label={t('algo.factors.sweepTo')} value={to} onChange={(e) => setTo(e.target.value)} />
        <NumberField
          label={t('algo.factors.sweepStep')}
          value={step}
          onChange={(e) => setStep(e.target.value)}
        />
        <Button onClick={run} busy={busy}>
          {t('algo.factors.sweepRun')}
        </Button>
      </div>
      {error && <p className="text-far text-xs">{error}</p>}
    </div>
  );
}
